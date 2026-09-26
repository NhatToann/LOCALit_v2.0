'use client'

import { useEffect, useRef, useState, Suspense } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { MessageCircle, Send, MapPin, Calendar, Clock, Languages, Star } from 'lucide-react'
import { createClient, getCurrentUser } from '@/utils/supabase/auth'
import type { Message } from '@/lib/types'
import { Avatar } from '@/components/ui/Avatar'
import { EmptyState } from '@/components/ui/Avatar'

interface ConvSummary {
  id: string
  tourist_id: string
  buddy_id: string
  tourist_name: string
  buddy_name: string
  partner_name: string
  partner_city: string | null
  is_partner_online: boolean
  updated_at: string
  partner_languages?: string[]
  partner_hourly_rate?: number | null
  partner_rating_avg?: number | null
}

interface UserRole {
  role: 'tourist' | 'buddy'
}

function ChatInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const buddyParam = searchParams.get('buddy')
  const convParam = searchParams.get('c')

  const [myId, setMyId] = useState<string | null>(null)
  const [myRole, setMyRole] = useState<UserRole['role'] | null>(null)
  const [conversations, setConversations] = useState<ConvSummary[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [draft, setDraft] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const lastSentRef = useRef<number>(0)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    init()
  }, [])

  useEffect(() => {
    if (buddyParam && myId) {
      openConversationWithBuddy(buddyParam)
    }
  }, [buddyParam, myId])

  useEffect(() => {
    if (convParam && myId) {
      const exists = conversations.some((c) => c.id === convParam)
      if (exists) setActiveId(convParam)
      router.replace('/chat')
    }
  }, [convParam, myId, conversations.length])

  useEffect(() => {
    if (activeId) loadMessages(activeId)
  }, [activeId])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function init() {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      router.push('/login')
      return
    }
    setMyId(user.id)
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()
    setMyRole((profile?.role as 'tourist' | 'buddy') ?? 'tourist')
    await loadConversations(user.id)
    setLoading(false)
  }

  async function loadConversations(uid: string) {
    const supabase = createClient()
    const { data } = await supabase
      .from('conversations')
      .select('id, tourist_id, buddy_id, updated_at, tourist:tourists(profile:profiles(full_name)), buddy:buddies(location_city, hourly_rate, rating_avg, languages, profile:profiles(full_name, is_online))')
      .or(`tourist_id.eq.${uid},buddy_id.eq.${uid}`)
      .order('updated_at', { ascending: false })

    const mapped: ConvSummary[] = (data ?? []).map((c: any) => {
      const isTouristSide = c.tourist_id === uid
      const partner = isTouristSide ? c.buddy : c.tourist
      const partnerName = partner?.profile?.full_name ?? 'Buddy'
      return {
        id: c.id,
        tourist_id: c.tourist_id,
        buddy_id: c.buddy_id,
        tourist_name: c.tourist?.profile?.full_name ?? '',
        buddy_name: partner?.profile?.full_name ?? '',
        partner_name: partnerName,
        partner_city: partner?.location_city ?? null,
        is_partner_online: !!partner?.profile?.is_online,
        updated_at: c.updated_at,
        partner_languages: partner?.languages ?? [],
        partner_hourly_rate: partner?.hourly_rate ?? null,
        partner_rating_avg: partner?.rating_avg ?? null,
      }
    })
    setConversations(mapped)
    if (mapped.length > 0 && !activeId) setActiveId(mapped[0].id)
  }

  async function openConversationWithBuddy(otherBuddyId: string) {
    if (!myId) return
    const supabase = createClient()
    const me = await getCurrentUser()
    if (!me) return

    const { data: existing } = await supabase
      .from('conversations')
      .select('id')
      .or(`and(tourist_id.eq.${me.id},buddy_id.eq.${otherBuddyId}),and(tourist_id.eq.${otherBuddyId},buddy_id.eq.${me.id})`)
      .maybeSingle()

    let convId = existing?.id
    if (!convId) {
      const { data: created, error } = await supabase
        .from('conversations')
        .insert({ tourist_id: me.id, buddy_id: otherBuddyId })
        .select('id')
        .single()
      if (error) {
        setError('Could not open conversation: ' + error.message)
        return
      }
      convId = created.id
    }
    await loadConversations(me.id)
    setActiveId(convId)
    router.replace('/chat')
  }

  async function loadMessages(conversationId: string) {
    const supabase = createClient()
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })

    if (error) {
      // silent — UI keeps empty state
      return
    }
    setMessages((data as Message[]) ?? [])

    if (myId) {
      await supabase
        .from('messages')
        .update({ is_read: true })
        .eq('conversation_id', conversationId)
        .neq('sender_id', myId)
    }
  }

  useEffect(() => {
    if (!activeId) return
    const supabase = createClient()
    const channel = supabase
      .channel(`conv-${activeId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${activeId}` },
        (payload) => {
          setMessages((prev) => {
            const next = payload.new as Message
            if (prev.some((m) => m.id === next.id)) return prev
            return [...prev, next]
          })
          if (myId && payload.new.sender_id !== myId) {
            supabase.from('messages').update({ is_read: true }).eq('id', payload.new.id).then()
          }
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [activeId, myId])

  async function handleSend(e: React.FormEvent) {
    e.preventDefault()
    const content = draft.trim()
    if (!content || !activeId || !myId) return
    if (content.length > 1000) return

    const now = Date.now()
    if (now - lastSentRef.current < 1000) {
      setError('Please wait a moment before sending another message.')
      return
    }
    lastSentRef.current = now

    setSending(true)
    setError('')
    const supabase = createClient()

    const { data, error: sendErr } = await supabase
      .from('messages')
      .insert({
        conversation_id: activeId,
        sender_id: myId,
        content,
      })
      .select('*')
      .single()

    if (sendErr) {
      setError('Could not send: ' + sendErr.message)
      setSending(false)
      return
    }
    if (data) {
      setMessages((prev) => {
        if (prev.some((m) => m.id === data.id)) return prev
        return [...prev, data as Message]
      })
    }
    await supabase
      .from('conversations')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', activeId)
    setDraft('')
    setSending(false)
  }

  if (loading) {
    return (
      <div className="container-page py-16 text-center">
        <div className="loading-spinner mx-auto" />
      </div>
    )
  }

  const activeConv = conversations.find((c) => c.id === activeId)

  if (conversations.length === 0 && !buddyParam) {
    return (
      <div className="container-page py-12">
        <h1 className="text-page-title mb-6">Messages</h1>
        <div className="border border-border rounded-sm p-12 bg-surface">
          <EmptyState
            icon={MessageCircle}
            title={myRole === 'buddy' ? 'No conversations yet' : 'No conversations yet'}
            description={
              myRole === 'buddy'
                ? 'When a tourist sends you a connection request and you accept, the conversation will appear here.'
                : 'Connect with a buddy to start chatting. Browse the buddy list to send your first request.'
            }
            action={
              myRole === 'buddy' ? null : (
                <Link
                  href="/tourist/browse"
                  className="inline-flex items-center justify-center h-10 px-4 text-sm font-medium rounded-sm bg-primary text-paper border border-primary hover:bg-primary-hover"
                >
                  Browse Da Nang buddies
                </Link>
              )
            }
          />
        </div>
      </div>
    )
  }

  return (
    <div className="container-page py-8">
      <h1 className="text-page-title mb-6">Messages</h1>

      <div className="border border-border rounded-sm bg-surface overflow-hidden flex flex-col md:flex-row" style={{ minHeight: 480 }}>
        {/* Sidebar */}
        <aside
          className="md:w-72 border-b md:border-b-0 md:border-r border-border overflow-y-auto flex-shrink-0"
          aria-label="Conversations"
        >
          {conversations.length === 0 ? (
            <div className="p-4 text-sm text-muted">Creating conversation...</div>
          ) : (
            <ul>
              {conversations.map((c) => {
                const isActive = c.id === activeId
                return (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => setActiveId(c.id)}
                      aria-current={isActive ? 'true' : undefined}
                      className={`w-full text-left p-4 border-b border-border last:border-b-0 hover:bg-paper transition-colors duration-150 ${
                        isActive ? 'bg-info-bg border-l-2 border-l-primary' : ''
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <Avatar name={c.partner_name} size="md" online={c.is_partner_online} />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">{c.partner_name}</p>
                          <p className="text-xs text-muted truncate">
                            {c.partner_city ?? 'Start a conversation'}
                          </p>
                        </div>
                        {c.is_partner_online ? (
                          <span
                            className="w-2.5 h-2.5 rounded-full bg-success flex-shrink-0"
                            aria-label="Online"
                          />
                        ) : null}
                      </div>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </aside>

        {/* Active thread */}
        <main className="flex-1 flex flex-col min-w-0">
          {activeConv ? (
            <>
              {/* Header */}
              <header className="px-4 py-3 border-b border-border flex items-center gap-3">
                <Avatar name={activeConv.partner_name} size="md" online={activeConv.is_partner_online} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold truncate">{activeConv.partner_name}</p>
                  <p className="text-xs text-muted">
                    {activeConv.is_partner_online ? 'Online now' : 'Offline'}
                  </p>
                </div>
                <Link
                  href={myRole === 'buddy' ? '/buddy/requests' : `/tourist/buddy/${activeConv.buddy_id}`}
                  className="text-sm text-primary hover:underline"
                >
                  View profile
                </Link>
              </header>

              {/* Quick actions (role-aware) */}
              <div className="px-4 py-2 border-b border-border bg-paper">
                <p className="text-xs text-muted mb-2">Quick actions</p>
                <div className="flex flex-wrap gap-2">
                  {myRole === 'tourist' ? (
                    <>
                      <QuickAction
                        href={`/tourist/buddy/${activeConv.buddy_id}`}
                        icon={MapPin}
                        label="View profile"
                      />
                      <QuickAction
                        href={`/tourist/trips/create?buddy=${activeConv.buddy_id}`}
                        icon={Calendar}
                        label="Plan a trip"
                      />
                      {activeConv.partner_hourly_rate && activeConv.partner_hourly_rate > 0 ? (
                        <span className="inline-flex items-center gap-1 h-7 px-2 text-xs rounded-sm bg-info-bg text-info border border-info-bg">
                          <Star size={12} aria-hidden="true" />
                          ${Number(activeConv.partner_hourly_rate).toFixed(0)}/hour
                        </span>
                      ) : null}
                    </>
                  ) : (
                    <>
                      <QuickAction
                        href={`/chat`}
                        icon={Clock}
                        label="Reply time"
                      />
                      <span className="inline-flex items-center gap-1 h-7 px-2 text-xs rounded-sm bg-info-bg text-info border border-info-bg">
                        <Languages size={12} aria-hidden="true" />
                        {(activeConv.partner_languages ?? []).slice(0, 3).join(', ') || '—'}
                      </span>
                    </>
                  )}
                </div>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-4 bg-paper" aria-live="polite">
                {messages.length === 0 ? (
                  <p className="text-sm text-muted text-center py-8">
                    Start a conversation with {activeConv.partner_name}.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {messages.map((m) => (
                      <MessageBubble
                        key={m.id}
                        message={m}
                        myId={myId}
                        partnerName={activeConv.partner_name}
                      />
                    ))}
                  </ul>
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Composer */}
              <form
                onSubmit={handleSend}
                className="flex items-center gap-2 p-3 border-t border-border bg-surface"
              >
                <input
                  className="form-input flex-1"
                  placeholder="Type a message"
                  value={draft}
                  onChange={(e) => {
                    setDraft(e.target.value)
                    setError('')
                  }}
                  maxLength={1000}
                  disabled={sending}
                  autoFocus
                  aria-label="Message"
                />
                <span className="text-xs text-muted whitespace-nowrap">{draft.length}/1000</span>
                <button
                  type="submit"
                  className="inline-flex items-center gap-1 h-10 px-4 text-sm font-medium rounded-sm bg-primary text-paper border border-primary hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={sending || !draft.trim()}
                  aria-label="Send message"
                >
                  <Send size={14} aria-hidden="true" />
                  Send
                </button>
              </form>
              {error ? (
                <p className="text-xs text-danger px-4 pb-2" role="alert">
                  {error}
                </p>
              ) : null}
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center p-8 text-sm text-muted">
              Choose a conversation to start chatting.
            </div>
          )}
        </main>
      </div>
    </div>
  )
}

function QuickAction({
  href,
  icon: IconCmp,
  label,
}: {
  href: string
  icon: typeof MapPin
  label: string
}) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1 h-7 px-2 text-xs rounded-sm bg-transparent text-ink border border-border-strong hover:bg-surface"
    >
      <IconCmp size={12} aria-hidden="true" />
      {label}
    </Link>
  )
}

function MessageBubble({
  message,
  myId,
  partnerName,
}: {
  message: Message
  myId: string | null
  partnerName: string
}) {
  const isOwn = myId === message.sender_id
  const time = new Date(message.created_at)
  const now = new Date()
  const sameDay = time.toDateString() === now.toDateString()
  const timeLabel = sameDay
    ? time.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
    : time.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })

  return (
    <li className={`flex items-end gap-2 ${isOwn ? 'justify-end' : 'justify-start'}`}>
      {!isOwn ? (
        <Avatar name={partnerName} size="sm" />
      ) : null}
      <div
        className={`max-w-[70%] px-3 py-2 rounded-sm text-sm leading-relaxed ${
          isOwn
            ? 'bg-primary text-paper rounded-br-none'
            : 'bg-surface border border-border text-ink rounded-bl-none'
        }`}
      >
        <p className="whitespace-pre-wrap break-words">{message.content}</p>
        <small className={`block text-[10px] mt-1 ${isOwn ? 'text-paper/70' : 'text-muted'}`}>
          <time dateTime={message.created_at}>{timeLabel}</time>
        </small>
      </div>
    </li>
  )
}

export default function ChatPage() {
  return (
    <Suspense fallback={<div className="container-page py-16 text-center"><div className="loading-spinner mx-auto" /></div>}>
      <ChatInner />
    </Suspense>
  )
}
