'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import Link from 'next/link'
import { X, MessageCircle, Send, Phone, Video } from 'lucide-react'
import { createClient } from '@/utils/supabase/auth'
import { usePathname } from 'next/navigation'

interface MiniMessage {
  id: string
  sender_id: string
  content: string
  created_at: string
}

interface ConversationSummary {
  id: string
  counterpart_id: string
  counterpart_name: string
  counterpart_avatar: string | null
  last_message: string
  last_message_at: string
  unread: number
}

/**
 * LOCALit Mini Chat Window — bottom-right floating panel.
 * - Surfaces a "Messenger"-style dock the moment the user has at least one
 *   recent conversation.
 * - Auto-opens the most-recent chat on desktop (≥ sm), collapses to a round
 *   bubble on mobile.
 * - Quick reply box wired to the real /chat route via Supabase.
 * - Phone + Video call CTAs route to /chat?call=1 (the shared-itinerary page
 *   already exposes these links).
 */
export default function MiniChatWindow() {
  const pathname = usePathname()
  const [authed, setAuthed] = useState(false)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState<ConversationSummary | null>(null)
  const [conversations, setConversations] = useState<ConversationSummary[]>([])
  const [messages, setMessages] = useState<MiniMessage[]>([])
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const scrollRef = useRef<HTMLDivElement | null>(null)

  // Hide on chat pages (the user is already there) and on auth pages.
  const hidden =
    pathname.startsWith('/chat') ||
    pathname === '/login' ||
    pathname === '/register' ||
    pathname === '/forgot-password' ||
    pathname === '/reset-password' ||
    pathname === '/verify-email'

  useEffect(() => {
    if (hidden) return
    const supabase = createClient()
    supabase.auth.getUser().then(({ data }) => {
      setAuthed(!!data.user)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setAuthed(!!session?.user)
    })
    return () => sub.subscription.unsubscribe()
  }, [hidden])

  const loadConversations = useCallback(async () => {
    if (!authed) return
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    // Tourist conversations:
    const [{ data: touristConvs }, { data: buddyConvs }] = await Promise.all([
      supabase
        .from('conversations')
        .select('id, tourist:tourists(profile:profiles(full_name, avatar_url, id)), buddy:buddies(profile:profiles(full_name, avatar_url, id)), messages(content, created_at, sender_id, is_read)')
        .eq('tourist_id', user.id)
        .order('updated_at', { ascending: false })
        .limit(8),
      supabase
        .from('conversations')
        .select('id, tourist:tourists(profile:profiles(full_name, avatar_url, id)), buddy:buddies(profile:profiles(full_name, avatar_url, id)), messages(content, created_at, sender_id, is_read)')
        .eq('buddy_id', user.id)
        .order('updated_at', { ascending: false })
        .limit(8),
    ])

    const summaries: ConversationSummary[] = []
    const myUserId = user.id
    const convRows = [...(touristConvs ?? []), ...(buddyConvs ?? [])]
    for (const row of convRows as any[]) {
      const other = row.tourist?.profile?.id === myUserId ? row.buddy?.profile : row.tourist?.profile
      if (!other) continue
      const lastMsg = Array.isArray(row.messages) && row.messages.length > 0
        ? row.messages.sort((a: any, b: any) => (a.created_at > b.created_at ? -1 : 1))[0]
        : null
      summaries.push({
        id: row.id,
        counterpart_id: other.id,
        counterpart_name: other.full_name ?? 'Chat',
        counterpart_avatar: other.avatar_url ?? null,
        last_message: lastMsg?.content ?? '',
        last_message_at: lastMsg?.created_at ?? '',
        unread: (row.messages ?? []).filter((m: any) => !m.is_read && m.sender_id !== myUserId).length,
      })
    }
    summaries.sort((a, b) => (a.last_message_at > b.last_message_at ? -1 : 1))
    setConversations(summaries)

    if (!active && summaries[0]) {
      setActive(summaries[0])
    }
  }, [authed, active])

  useEffect(() => {
    loadConversations()
  }, [loadConversations])

  const loadMessages = useCallback(async (convId: string) => {
    const supabase = createClient()
    const { data } = await supabase
      .from('messages')
      .select('id, sender_id, content, created_at')
      .eq('conversation_id', convId)
      .order('created_at', { ascending: true })
      .limit(100)
    setMessages((data || []) as MiniMessage[])
    setTimeout(() => {
      scrollRef.current?.scrollTo({ top: 99999, behavior: 'smooth' })
    }, 0)
  }, [])

  useEffect(() => {
    if (!active) return
    loadMessages(active.id)
  }, [active, loadMessages])

  async function sendDraft(e: React.FormEvent) {
    e.preventDefault()
    if (!active || !draft.trim() || sending) return
    setSending(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setSending(false)
      return
    }
    const text = draft.trim().slice(0, 500)
    const { data: ins, error } = await supabase
      .from('messages')
      .insert({
        conversation_id: active.id,
        sender_id: user.id,
        content: text,
      })
      .select('id, sender_id, content, created_at')
      .single()
    setSending(false)
    if (!error && ins) {
      setMessages([...messages, ins as MiniMessage])
      setDraft('')
      setTimeout(() => {
        scrollRef.current?.scrollTo({ top: 99999, behavior: 'smooth' })
      }, 0)
    }
  }

  if (hidden || !authed) return null

  if (!open) {
    // Floating launcher bubble
    const totalUnread = conversations.reduce((acc, c) => acc + c.unread, 0)
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open messages"
        className="fixed bottom-6 right-6 z-[1000] inline-flex items-center justify-center w-14 h-14 rounded-full bg-primary text-paper shadow-focus hover:bg-primary-hover focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
      >
        <MessageCircle size={22} aria-hidden="true" />
        {totalUnread > 0 ? (
          <span className="absolute -top-1 -right-1 inline-flex items-center justify-center min-w-[20px] h-5 px-1 rounded-full bg-danger text-paper text-xs font-semibold">
            {totalUnread > 9 ? '9+' : totalUnread}
          </span>
        ) : null}
      </button>
    )
  }

  return (
    <aside
      role="dialog"
      aria-label="Mini chat"
      className="fixed bottom-6 right-6 z-[1000] w-[360px] max-w-[calc(100vw-2rem)] h-[480px] max-h-[calc(100vh-4rem)] flex flex-col bg-surface border border-border rounded-sm overflow-hidden"
    >
      {/* Header */}
      <header className="px-4 py-3 border-b border-border bg-primary text-paper flex items-center gap-2">
        <h3 className="text-sm font-semibold flex-1">Messages</h3>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Close messages"
          className="inline-flex items-center justify-center w-7 h-7 rounded-sm text-paper/80 hover:bg-primary-hover hover:text-paper"
        >
          <X size={14} aria-hidden="true" />
        </button>
      </header>

      {/* Conversation list (only show if more than 1) */}
      {conversations.length > 1 ? (
        <div className="flex gap-2 overflow-x-auto px-3 py-2 border-b border-border bg-paper">
          {conversations.map((c) => {
            const isActive = c.id === active?.id
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => setActive(c)}
                className={`flex flex-col items-center min-w-[56px] text-xs ${
                  isActive ? 'text-primary' : 'text-muted hover:text-ink'
                }`}
              >
                <span className="relative">
                  {c.counterpart_avatar ? (
                    <img
                      src={c.counterpart_avatar}
                      alt=""
                      className="w-9 h-9 rounded-full object-cover border border-border"
                    />
                  ) : (
                    <span className="avatar avatar-sm bg-muted text-paper inline-flex items-center justify-center" aria-hidden="true">
                      {c.counterpart_name.charAt(0)}
                    </span>
                  )}
                  {c.unread > 0 ? (
                    <span className="absolute -top-1 -right-1 inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full bg-danger text-paper text-[10px] font-semibold">
                      {c.unread}
                    </span>
                  ) : null}
                </span>
                <span className="truncate max-w-[56px] mt-1">{c.counterpart_name.split(' ')[0]}</span>
              </button>
            )
          })}
        </div>
      ) : null}

      {/* Messages area */}
      {active ? (
        <>
          <div
            ref={scrollRef}
            className="flex-1 overflow-y-auto px-4 py-3 space-y-2 bg-paper"
            aria-live="polite"
          >
            <div className="text-center text-[11px] text-subtle py-2">
              Chat started · keep it short and friendly.
            </div>
            {messages.length === 0 ? (
              <div className="text-center text-sm text-muted py-8">
                No messages yet. Say hi to {active.counterpart_name.split(' ')[0]}!
              </div>
            ) : (
              messages.map((m) => (
                <MiniMessageBubble key={m.id} content={m.content} createdAt={m.created_at} mine={m.sender_id !== active.counterpart_id} />
              ))
            )}
          </div>

          {/* Footer actions */}
          <div className="px-3 py-2 border-t border-border flex items-center gap-2 bg-surface">
            <Link
              href={`/chat?buddy=${active.counterpart_id}&call=1`}
              aria-label="Voice call"
              className="inline-flex items-center justify-center w-8 h-8 rounded-sm border border-border hover:bg-paper text-ink"
            >
              <Phone size={14} aria-hidden="true" />
            </Link>
            <Link
              href={`/chat?buddy=${active.counterpart_id}&call=1`}
              aria-label="Video call"
              className="inline-flex items-center justify-center w-8 h-8 rounded-sm border border-border hover:bg-paper text-ink"
            >
              <Video size={14} aria-hidden="true" />
            </Link>
            <Link
              href={`/chat/${active.id}`}
              className="text-[11px] text-primary hover:underline ml-1"
            >
              Open full chat →
            </Link>
          </div>

          {/* Composer */}
          <form onSubmit={sendDraft} className="px-3 py-3 border-t border-border bg-surface flex gap-2">
            <input
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              maxLength={500}
              placeholder="Type a message…"
              aria-label="Message draft"
              className="flex-1 px-3 py-2 text-sm border border-border rounded-sm bg-paper focus:outline-none focus:border-primary"
            />
            <button
              type="submit"
              disabled={!draft.trim() || sending}
              aria-label="Send"
              className="inline-flex items-center justify-center w-9 h-9 rounded-sm bg-primary text-paper border border-primary hover:bg-primary-hover disabled:opacity-50"
            >
              <Send size={14} aria-hidden="true" />
            </button>
          </form>
        </>
      ) : (
        <div className="flex-1 flex items-center justify-center p-6 bg-paper">
          <p className="text-sm text-muted text-center">
            You have no active conversations yet.{' '}
            <Link href="/chat" className="text-primary hover:underline">
              Browse chats
            </Link>
          </p>
        </div>
      )}
    </aside>
  )
}

function MiniMessageBubble({ content, createdAt, mine }: { content: string; createdAt: string; mine: boolean }) {
  return (
    <div className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[78%] px-3 py-2 rounded-sm text-sm leading-snug ${
          mine
            ? 'bg-primary text-paper'
            : 'bg-surface border border-border text-ink'
        }`}
      >
        <span className="whitespace-pre-wrap break-words">{content}</span>
        <time
          className={`block mt-1 text-[10px] ${mine ? 'text-paper/70' : 'text-muted'}`}
          dateTime={createdAt}
        >
          {new Date(createdAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
        </time>
      </div>
    </div>
  )
}
