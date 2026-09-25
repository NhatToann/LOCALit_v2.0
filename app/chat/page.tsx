'use client'

import { useEffect, useRef, useState, Suspense } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient, getCurrentUser } from '@/utils/supabase/auth'
import type { Message } from '@/lib/types'

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
}

function ChatInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const buddyParam = searchParams.get('buddy')
  const convParam = searchParams.get('c')

  const [myId, setMyId] = useState<string | null>(null)
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (buddyParam && myId) {
      openConversationWithBuddy(buddyParam)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buddyParam, myId])

  useEffect(() => {
    if (convParam && myId) {
      // Just select this conversation from existing list
      const exists = conversations.some((c) => c.id === convParam)
      if (exists) setActiveId(convParam)
      router.replace('/chat')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    await loadConversations(user.id)
    setLoading(false)
  }

  async function loadConversations(uid: string) {
    const supabase = createClient()
    const { data } = await supabase
      .from('conversations')
      .select('id, tourist_id, buddy_id, updated_at, tourist:tourists(profile:profiles(full_name)), buddy:buddies(location_city, profile:profiles(full_name, is_online))')
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
      }
    })
    setConversations(mapped)
    if (mapped.length > 0) setActiveId(mapped[0].id)
  }

  async function openConversationWithBuddy(otherBuddyId: string) {
    if (!myId) return
    const supabase = createClient()
    const me = await getCurrentUser()
    if (!me) return

    // Try to find existing
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
        setError('Không thể mở cuộc trò chuyện: ' + error.message)
        return
      }
      convId = created.id
    }
    await loadConversations(me.id)
    setActiveId(convId)
    // Clean up the query param so refresh doesn't reopen
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
      console.error(error)
      return
    }
    setMessages((data as Message[]) ?? [])

    // Mark unread messages as read
    if (myId) {
      await supabase
        .from('messages')
        .update({ is_read: true })
        .eq('conversation_id', conversationId)
        .neq('sender_id', myId)
    }
  }

  // Realtime subscription
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
          // Mark as read if it's from partner
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

    // Rate limit: 1 message per second to avoid spam
    const now = Date.now()
    if (now - lastSentRef.current < 1000) {
      setError('Vui lòng chờ một chút trước khi gửi tiếp.')
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
      setError('Không thể gửi: ' + sendErr.message)
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
    return <div className="container py-xl text-center"><div className="loading-spinner mx-auto" /></div>
  }

  const activeConv = conversations.find((c) => c.id === activeId)

  if (conversations.length === 0 && !buddyParam) {
    return (
      <div className="container py-xl">
        <h1 className="text-3xl font-bold mb-lg">💬 Tin nhắn</h1>
        <div className="empty-state">
          <p style={{ fontSize: 48 }}>💬</p>
          <h3>Chưa có cuộc trò chuyện</h3>
          <p className="text-muted mt-sm">Kết nối với buddy để bắt đầu chat</p>
          <Link href="/tourist/browse" className="btn btn-primary mt-md">Tìm buddy</Link>
        </div>
      </div>
    )
  }

  return (
    <div className="container py-xl">
      <h1 className="text-3xl font-bold mb-lg">💬 Tin nhắn</h1>

      <div
        className="card chat-shell"
        style={{
          height: 'calc(100vh - var(--header-height) - 160px)',
          minHeight: 480,
          display: 'flex',
          flexDirection: 'row',
          overflow: 'hidden',
        }}
      >
        <aside className="chat-sidebar">
          {conversations.length === 0 ? (
            <div className="empty-state" style={{ padding: 'var(--space-lg)' }}>
              <p className="text-sm text-muted">Đang tạo cuộc trò chuyện...</p>
            </div>
          ) : (
            conversations.map((c) => {
              const isActive = c.id === activeId
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setActiveId(c.id)}
                  className={`chat-sidebar-item ${isActive ? 'active' : ''}`}
                >
                  <span className="avatar avatar-md">{c.partner_name.charAt(0)}</span>
                  <span className="chat-sidebar-info">
                    <span className="chat-sidebar-name">{c.partner_name}</span>
                    <span className="chat-sidebar-sub">
                      {c.partner_city ? `📍 ${c.partner_city}` : 'Bắt đầu cuộc trò chuyện'}
                    </span>
                  </span>
                  {c.is_partner_online && <span className="online-dot" />}
                </button>
              )
            })
          )}
        </aside>

        <main className="chat-main">
          {activeConv ? (
            <>
              <div className="chat-header">
                <span className="avatar avatar-md">{activeConv.partner_name.charAt(0)}</span>
                <div style={{ flex: 1 }}>
                  <p className="font-semibold">{activeConv.partner_name}</p>
                  <p className="text-xs text-muted">
                    {activeConv.is_partner_online ? '🟢 Đang hoạt động' : '⚪ Không hoạt động'}
                  </p>
                </div>
              </div>

              <div className="chat-messages">
                {messages.length === 0 ? (
                  <div className="empty-state">
                    <p className="text-muted">Bắt đầu cuộc trò chuyện với {activeConv.partner_name}!</p>
                  </div>
                ) : (
                  messages.map((m) => (
                    <MessageBubble key={m.id} message={m} myId={myId} partnerInitial={activeConv.partner_name.charAt(0)} />
                  ))
                )}
                <div ref={messagesEndRef} />
              </div>

              <form onSubmit={handleSend} className="chat-input-row">
                <input
                  className="form-input"
                  placeholder="Nhập tin nhắn..."
                  value={draft}
                  onChange={(e) => { setDraft(e.target.value); setError('') }}
                  maxLength={1000}
                  disabled={sending}
                  autoFocus
                  aria-label="Tin nhắn"
                />
                <span className="text-xs text-muted" style={{ alignSelf: 'center', minWidth: 50, textAlign: 'right' }}>
                  {draft.length}/1000
                </span>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={sending || !draft.trim()}
                  aria-label="Gửi tin nhắn"
                >
                  ➤ Gửi
                </button>
              </form>
              {error && (
                <p className="text-xs text-danger" style={{ padding: '0 var(--space-md) var(--space-sm)' }}>{error}</p>
              )}
            </>
          ) : (
            <div className="empty-state">
              <p style={{ fontSize: 48 }}>👈</p>
              <p className="text-muted">Chọn một cuộc trò chuyện để bắt đầu</p>
            </div>
          )}
        </main>
      </div>

      <style>{chatStyles}</style>
    </div>
  )
}

function MessageBubble({ message, myId, partnerInitial }: { message: Message; myId: string | null; partnerInitial: string }) {
  const isOwn = myId === message.sender_id
  return (
    <div style={{ display: 'flex', justifyContent: isOwn ? 'flex-end' : 'flex-start', marginBottom: 12 }}>
      {!isOwn && (
        <span className="avatar avatar-sm" style={{ marginRight: 8, alignSelf: 'flex-end' }}>
          {partnerInitial}
        </span>
      )}
      <div className={`bubble ${isOwn ? 'bubble-own' : 'bubble-partner'}`}>
        <p style={{ wordBreak: 'break-word', whiteSpace: 'pre-wrap' }}>{message.content}</p>
        <small className="bubble-time">
          {new Date(message.created_at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
        </small>
      </div>
    </div>
  )
}

const chatStyles = `
.chat-shell { background: var(--bg-white); }
.chat-sidebar {
  width: 300px;
  border-right: 1px solid var(--border-color);
  overflow-y: auto;
  flex-shrink: 0;
}
.chat-sidebar-item {
  width: 100%;
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  padding: var(--space-md);
  background: transparent;
  border: none;
  border-bottom: 1px solid var(--border-color);
  cursor: pointer;
  text-align: left;
  transition: background var(--transition-fast);
  position: relative;
}
.chat-sidebar-item:hover { background: var(--bg-gray); }
.chat-sidebar-item.active { background: var(--primary-alpha); border-left: 3px solid var(--primary); }
.chat-sidebar-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.chat-sidebar-name {
  font-weight: 600;
  font-size: var(--font-size-sm);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.chat-sidebar-sub {
  font-size: var(--font-size-xs);
  color: var(--text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.online-dot {
  width: 10px;
  height: 10px;
  background: var(--success);
  border-radius: 50%;
  border: 2px solid var(--bg-white);
  flex-shrink: 0;
}
.chat-main { flex: 1; display: flex; flex-direction: column; min-width: 0; }
.chat-header {
  display: flex;
  align-items: center;
  gap: var(--space-md);
  padding: var(--space-md) var(--space-lg);
  border-bottom: 1px solid var(--border-color);
}
.chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: var(--space-lg);
  background: var(--bg-light);
}
.bubble {
  max-width: 70%;
  padding: 8px 14px;
  border-radius: 18px;
  box-shadow: var(--shadow-sm);
  font-size: var(--font-size-sm);
  line-height: 1.4;
}
.bubble-own {
  background: var(--primary);
  color: white;
  border-bottom-right-radius: 4px;
}
.bubble-partner {
  background: white;
  color: var(--text-primary);
  border-bottom-left-radius: 4px;
}
.bubble-time {
  opacity: 0.7;
  font-size: 10px;
  display: block;
  margin-top: 4px;
}
.chat-input-row {
  display: flex;
  gap: var(--space-sm);
  padding: var(--space-md);
  border-top: 1px solid var(--border-color);
  background: white;
}
.chat-input-row .form-input { flex: 1; }
@media (max-width: 768px) {
  .chat-sidebar { width: 100%; max-width: 100%; }
  .chat-shell { flex-direction: column; }
}
`

export default function ChatPage() {
  return (
    <Suspense fallback={<div className="container py-xl text-center"><div className="loading-spinner mx-auto" /></div>}>
      <ChatInner />
    </Suspense>
  )
}
