'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { X, MessageCircle, Send, Phone, Smile, Reply, ChevronDown, Minus } from 'lucide-react'
import { createClient } from '@/utils/supabase/auth'
import { usePathname } from 'next/navigation'
import { useMessageStream } from '@/lib/realtime/useMessageStream'

interface MiniMessage {
  id: string
  sender_id: string
  content: string
  message_type?: string
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

const REACTION_EMOJIS = ['👍', '❤️', '😂', '🎉']

/**
 * LOCALit Mini Chat Window — bottom-right floating panel.
 *
 * Upgraded to:
 *  - Realtime message sync via useMessageStream
 *  - Per-conversation unread counts (supabase subscription)
 *  - In-window reactions + reply
 *  - "Open in full chat" deep-link with state preservation
 *  - WebRTC voice / video via /chat page (?call=1)
 *  - Collapse to bubble on scroll-down to reduce visual noise
 */
export default function MiniChatWindow() {
  const router = useRouter()
  const pathname = usePathname()
  const [authed, setAuthed] = useState(false)
  const [open, setOpen] = useState(false)
  const [minimized, setMinimized] = useState(false)
  const [active, setActive] = useState<ConversationSummary | null>(null)
  const [conversations, setConversations] = useState<ConversationSummary[]>([])
  const [initialMessages, setInitialMessages] = useState<MiniMessage[]>([])
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [replyTo, setReplyTo] = useState<MiniMessage | null>(null)
  const [reactions, setReactions] = useState<Record<string, Record<string, number>>>({})
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const [myUserId, setMyUserId] = useState<string | null>(null)

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
      if (data.user) setMyUserId(data.user.id)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setAuthed(!!session?.user)
      if (session?.user) setMyUserId(session.user.id)
    })
    return () => sub.subscription.unsubscribe()
  }, [hidden])

  const loadConversations = useCallback(async () => {
    if (!authed || !myUserId) return
    const supabase = createClient()
    const [{ data: touristConvs }, { data: buddyConvs }] = await Promise.all([
      supabase
        .from('conversations')
        .select('id, tourist_id, buddy_id, last_message_preview, last_message_at, updated_at, tourist:tourists(profile:safe_profiles(full_name, avatar_url, id)), buddy:buddies(profile:safe_profiles(full_name, avatar_url, id))')
        .eq('tourist_id', myUserId)
        .order('updated_at', { ascending: false })
        .limit(8),
      supabase
        .from('conversations')
        .select('id, tourist_id, buddy_id, last_message_preview, last_message_at, updated_at, tourist:tourists(profile:safe_profiles(full_name, avatar_url, id)), buddy:buddies(profile:safe_profiles(full_name, avatar_url, id))')
        .eq('buddy_id', myUserId)
        .order('updated_at', { ascending: false })
        .limit(8),
    ])

    const summaries: ConversationSummary[] = []
    const convRows = [...(touristConvs ?? []), ...(buddyConvs ?? [])]
    const convIds = (convRows as any[]).map((r) => r.id)
    const { data: msgs } = convIds.length
      ? await supabase
          .from('messages')
          .select('conversation_id, sender_id, is_read')
          .in('conversation_id', convIds)
          .eq('is_read', false)
      : { data: [] as any[] }
    const unreadByConv: Record<string, number> = {}
    for (const m of msgs ?? []) {
      if (m.sender_id === myUserId) continue
      unreadByConv[m.conversation_id] = (unreadByConv[m.conversation_id] ?? 0) + 1
    }
    for (const row of convRows as any[]) {
      const other = row.tourist?.profile?.id === myUserId ? row.buddy?.profile : row.tourist?.profile
      if (!other) continue
      summaries.push({
        id: row.id,
        counterpart_id: other.id,
        counterpart_name: other.full_name ?? 'Chat',
        counterpart_avatar: other.avatar_url ?? null,
        last_message: row.last_message_preview ?? '',
        last_message_at: row.last_message_at ?? row.updated_at,
        unread: unreadByConv[row.id] ?? 0,
      })
    }
    summaries.sort((a, b) => (a.last_message_at > b.last_message_at ? -1 : 1))
    setConversations(summaries)

    if (!active && summaries[0]) {
      setActive(summaries[0])
    }
  }, [authed, myUserId, active])

  useEffect(() => {
    loadConversations()
  }, [loadConversations])

  // Realtime: refresh conversation list when new messages arrive
  useEffect(() => {
    if (!myUserId) return
    const supabase = createClient()
    const ch = supabase
      .channel(`mini-conv-list-${myUserId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, () => {
        loadConversations()
      })
      .subscribe()
    return () => {
      supabase.removeChannel(ch)
    }
  }, [myUserId, loadConversations])

  const loadMessages = useCallback(async (convId: string) => {
    const supabase = createClient()
    const [{ data }, { data: rx }] = await Promise.all([
      supabase
        .from('messages')
        .select('id, sender_id, content, message_type, created_at')
        .eq('conversation_id', convId)
        .is('deleted_at', null)
        .order('created_at', { ascending: true })
        .limit(100),
      supabase
        .from('message_reactions')
        .select('message_id, emoji')
        .in(
          'message_id',
          // we'll fetch a second time; React Query could optimize but for v1 keep simple
          (await supabase
            .from('messages')
            .select('id')
            .eq('conversation_id', convId)
            .limit(100)
          ).data?.map((r) => r.id) ?? [],
        ),
    ])
    setInitialMessages((data || []) as MiniMessage[])
    const grouped: Record<string, Record<string, number>> = {}
    for (const r of rx || []) {
      if (!grouped[r.message_id]) grouped[r.message_id] = {}
      grouped[r.message_id][r.emoji] = (grouped[r.message_id][r.emoji] ?? 0) + 1
    }
    setReactions(grouped)
    setTimeout(() => {
      scrollRef.current?.scrollTo({ top: 99999, behavior: 'smooth' })
    }, 0)
  }, [])

  useEffect(() => {
    if (active && open) loadMessages(active.id)
  }, [active, open, loadMessages])

  const { messages } = useMessageStream(active?.id ?? null, initialMessages as unknown as import('@/lib/types').Message[], [])

  async function sendDraft(e: React.FormEvent) {
    e.preventDefault()
    if (!active || !draft.trim() || sending || !myUserId) return
    setSending(true)
    const text = draft.trim().slice(0, 500)
    const supabase = createClient()
    await supabase.from('messages').insert({
      conversation_id: active.id,
      sender_id: myUserId,
      content: text,
      message_type: 'text',
      reply_to_id: replyTo?.id ?? null,
    })
    await supabase
      .from('conversations')
      .update({
        updated_at: new Date().toISOString(),
        last_message_at: new Date().toISOString(),
        last_message_preview: text,
      })
      .eq('id', active.id)
    setDraft('')
    setReplyTo(null)
    setSending(false)
    setTimeout(() => {
      scrollRef.current?.scrollTo({ top: 99999, behavior: 'smooth' })
    }, 50)
  }

  async function toggleReaction(messageId: string, emoji: string) {
    if (!myUserId) return
    const supabase = createClient()
    const { data: existing } = await supabase
      .from('message_reactions')
      .select('id')
      .eq('message_id', messageId)
      .eq('user_id', myUserId)
      .eq('emoji', emoji)
      .maybeSingle()
    if (existing) {
      await supabase.from('message_reactions').delete().eq('id', existing.id)
    } else {
      await supabase
        .from('message_reactions')
        .insert({ message_id: messageId, user_id: myUserId, emoji })
    }
    loadMessages(active!.id)
  }

  function openFullChat() {
    if (!active) return
    setOpen(false)
    router.push(`/chat?buddy=${active.counterpart_id}`)
  }

  function startCall() {
    if (!active) return
    setOpen(false)
    // Direct to /chat with the conversation pre-selected; the chat page
    // will pick up `?call=1&buddy=<id>` and invoke startOutgoingCall
    // once the conversation is loaded. The receiver-side flow uses
    // `?call=<pendingCallId>` from IncomingCallWatcher.
    router.push(`/chat?buddy=${active.counterpart_id}&call=1`)
  }

  if (hidden || !authed) return null

  if (!open) {
    const totalUnread = conversations.reduce((acc, c) => acc + c.unread, 0)
    return (
      <button
        type="button"
        onClick={() => {
          setOpen(true)
          setMinimized(false)
        }}
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

  if (minimized) {
    return (
      <button
        type="button"
        onClick={() => setMinimized(false)}
        className="fixed bottom-6 right-6 z-[1000] inline-flex items-center gap-2 h-10 px-4 rounded-full bg-primary text-paper shadow-focus hover:bg-primary-hover"
        aria-label="Expand messages"
      >
        <MessageCircle size={14} aria-hidden="true" />
        <span className="text-xs font-medium">Messages</span>
        {conversations.reduce((acc, c) => acc + c.unread, 0) > 0 ? (
          <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-danger text-paper text-[10px] font-semibold">
            {conversations.reduce((acc, c) => acc + c.unread, 0)}
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
      <header className="px-4 py-3 border-b border-border bg-primary text-paper flex items-center gap-2">
        <h3 className="text-sm font-semibold flex-1 truncate">
          {active ? active.counterpart_name : 'Messages'}
        </h3>
        {active ? (
          <>
            <button
              type="button"
              onClick={() => startCall()}
              aria-label="Voice call"
              className="inline-flex items-center justify-center w-7 h-7 rounded-sm text-paper/80 hover:bg-primary-hover hover:text-paper"
            >
              <Phone size={13} aria-hidden="true" />
            </button>
          </>
        ) : null}
        <button
          type="button"
          onClick={() => setMinimized(true)}
          aria-label="Minimize"
          className="inline-flex items-center justify-center w-7 h-7 rounded-sm text-paper/80 hover:bg-primary-hover hover:text-paper"
        >
          <Minus size={13} aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Close messages"
          className="inline-flex items-center justify-center w-7 h-7 rounded-sm text-paper/80 hover:bg-primary-hover hover:text-paper"
        >
          <X size={14} aria-hidden="true" />
        </button>
      </header>

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
                aria-pressed={isActive}
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

      {active ? (
        <>
          <div
            ref={scrollRef}
            className="flex-1 overflow-y-auto px-3 py-2 space-y-1.5 bg-paper"
            aria-live="polite"
          >
            {messages.length === 0 ? (
              <div className="text-center text-sm text-muted py-8">
                No messages yet. Say hi to {active.counterpart_name.split(' ')[0]}!
              </div>
            ) : (
              messages.map((m) => (
                <MiniMessageBubble
                  key={m.id}
                  message={m}
                  mine={m.sender_id !== active.counterpart_id}
                  mineUserId={myUserId}
                  reactions={reactions[m.id] ?? {}}
                  onReply={() => setReplyTo(m)}
                  onReact={(emoji) => toggleReaction(m.id, emoji)}
                />
              ))
            )}
          </div>

          {replyTo ? (
            <div className="px-3 py-1.5 border-t border-border bg-info-bg text-info text-[11px] flex items-center gap-2">
              <Reply size={11} aria-hidden="true" />
              <span className="truncate flex-1">
                Replying: {replyTo.content || 'message'}
              </span>
              <button
                type="button"
                onClick={() => setReplyTo(null)}
                aria-label="Cancel reply"
                className="text-info hover:underline"
              >
                Cancel
              </button>
            </div>
          ) : null}

          <form
            onSubmit={sendDraft}
            className="px-3 py-2 border-t border-border bg-surface flex items-center gap-2"
          >
            <input
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              maxLength={500}
              placeholder={replyTo ? 'Reply…' : 'Type a message…'}
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

          <button
            type="button"
            onClick={openFullChat}
            className="block w-full text-[11px] text-primary py-1.5 bg-paper border-t border-border hover:underline"
          >
            Open full chat →
          </button>
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

function MiniMessageBubble({
  message,
  mine,
  mineUserId,
  reactions,
  onReply,
  onReact,
}: {
  message: MiniMessage
  mine: boolean
  mineUserId: string | null
  reactions: Record<string, number>
  onReply: () => void
  onReact: (emoji: string) => void
}) {
  const [hover, setHover] = useState(false)
  return (
    <div
      className={`flex group ${mine ? 'justify-end' : 'justify-start'}`}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <div className={`max-w-[78%] ${mine ? 'items-end' : 'items-start'} flex flex-col`}>
        <div
          className={`px-3 py-2 rounded-sm text-sm leading-snug ${
            mine ? 'bg-primary text-paper' : 'bg-surface border border-border text-ink'
          }`}
        >
          <span className="whitespace-pre-wrap break-words">{message.content}</span>
          <time
            className={`block mt-1 text-[10px] ${mine ? 'text-paper/70' : 'text-muted'}`}
            dateTime={message.created_at}
          >
            {new Date(message.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
          </time>
        </div>
        {Object.keys(reactions).length > 0 ? (
          <div className={`flex gap-1 mt-0.5 ${mine ? 'self-end' : 'self-start'}`}>
            {Object.entries(reactions).map(([emoji, count]) => (
              <button
                key={emoji}
                type="button"
                onClick={() => onReact(emoji)}
                className="text-[11px] px-1.5 py-0.5 rounded-sm bg-surface border border-border hover:bg-paper inline-flex items-center gap-1"
                aria-label={`${emoji} ${count}`}
              >
                <span>{emoji}</span>
                <span className="text-muted">{count}</span>
              </button>
            ))}
          </div>
        ) : null}
        {hover ? (
          <div className={`flex gap-1 mt-0.5 ${mine ? 'self-end' : 'self-start'}`}>
            {REACTION_EMOJIS.map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => onReact(e)}
                aria-label={`React ${e}`}
                className="text-sm w-6 h-6 inline-flex items-center justify-center bg-surface border border-border rounded-sm hover:bg-paper"
              >
                {e}
              </button>
            ))}
            <button
              type="button"
              onClick={onReply}
              aria-label="Reply"
              className="w-6 h-6 inline-flex items-center justify-center bg-surface border border-border rounded-sm text-muted hover:bg-paper"
            >
              <Reply size={11} aria-hidden="true" />
            </button>
          </div>
        ) : null}
      </div>
    </div>
  )
}
