'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/utils/supabase/auth'
import type { Conversation, Message } from '@/lib/types'

export default function ChatPage() {
  const [conversations, setConversations] = useState<any[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [draft, setDraft] = useState('')
  const [loading, setLoading] = useState(true)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    loadConversations()
  }, [])

  useEffect(() => {
    if (activeId) loadMessages(activeId)
  }, [activeId])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function loadConversations() {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data } = await supabase
      .from('conversations')
      .select('*, tourist:tourists(*, profile:profiles(*)), buddy:buddies(*, profile:profiles(*))')
      .or(`tourist_id.eq.${user.id},buddy_id.eq.${user.id}`)
      .order('updated_at', { ascending: false })

    setConversations(data || [])
    if (data && data.length > 0) setActiveId(data[0].id)
    setLoading(false)
  }

  async function loadMessages(conversationId: string) {
    const supabase = createClient()
    const { data } = await supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })

    setMessages((data as Message[]) || [])

    // Mark as read
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      await supabase.from('messages')
        .update({ is_read: true })
        .eq('conversation_id', conversationId)
        .neq('sender_id', user.id)
    }
  }

  // Subscribe to realtime
  useEffect(() => {
    if (!activeId) return

    const supabase = createClient()
    const channel = supabase
      .channel(`conv-${activeId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${activeId}` },
        (payload) => {
          setMessages(prev => [...prev, payload.new as Message])
        })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [activeId])

  async function handleSend(e: React.FormEvent) {
    e.preventDefault()
    if (!draft.trim() || !activeId) return

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const content = draft.trim()
    setDraft('')

    await supabase.from('messages').insert({
      conversation_id: activeId,
      sender_id: user.id,
      content,
    })

    await supabase.from('conversations').update({
      updated_at: new Date().toISOString(),
    }).eq('id', activeId)
  }

  if (loading) {
    return <div className="container py-xl text-center"><div className="loading-spinner mx-auto" /></div>
  }

  if (conversations.length === 0) {
    return (
      <div className="container py-xl">
        <div className="empty-state">
          <p style={{ fontSize: 48 }}>💬</p>
          <h3>Chưa có cuộc trò chuyện</h3>
          <p className="text-muted mt-sm">Kết nối với buddy để bắt đầu chat</p>
          <Link href="/tourist/browse" className="btn btn-primary mt-md">Tìm buddy</Link>
        </div>
      </div>
    )
  }

  const activeConv = conversations.find(c => c.id === activeId)
  const isTourist = activeConv?.tourist_id && activeConv.tourist.profile.full_name
  const partner = activeConv?.tourist_id === activeConv?.buddy_id
    ? activeConv?.buddy?.profile
    : (isTourist ? activeConv?.buddy?.profile : activeConv?.tourist?.profile)

  return (
    <div className="container py-xl">
      <h1 className="text-3xl font-bold mb-lg">💬 Tin nhắn</h1>

      <div className="card" style={{ height: '70vh', display: 'flex', flexDirection: 'row', overflow: 'hidden' }}>
        {/* Sidebar */}
        <aside style={{ width: 280, borderRight: '1px solid var(--border-color)', overflow: 'auto', flexShrink: 0 }}>
          {conversations.map((c: any) => {
            const p = c.tourist_id === c.tourist?.profile?.id ? c.buddy?.profile : c.tourist?.profile
            const pName = p?.full_name || 'Buddy'
            return (
              <button
                key={c.id}
                onClick={() => setActiveId(c.id)}
                style={{
                  width: '100%',
                  textAlign: 'left',
                  padding: 12,
                  borderBottom: '1px solid var(--border-color)',
                  background: c.id === activeId ? 'var(--bg-gray)' : 'transparent',
                  cursor: 'pointer',
                }}
              >
                <div className="flex items-center gap-sm">
                  <div className="avatar avatar-md">{pName.charAt(0)}</div>
                  <div className="flex-1 overflow-hidden">
                    <p className="font-medium text-sm" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{pName}</p>
                    <p className="text-xs text-muted">Bắt đầu cuộc trò chuyện</p>
                  </div>
                </div>
              </button>
            )
          })}
        </aside>

        {/* Chat area */}
        <main style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          {activeConv && (
            <>
              <div style={{ padding: 'var(--space-md) var(--space-lg)', borderBottom: '1px solid var(--border-color)' }}>
                <div className="flex items-center gap-sm">
                  <div className="avatar avatar-md">{partner?.full_name?.charAt(0) || '?'}</div>
                  <div>
                    <p className="font-semibold">{partner?.full_name}</p>
                    <p className="text-xs text-muted">
                      {partner?.full_name ? 'Đang hoạt động' : ''}
                    </p>
                  </div>
                </div>
              </div>

              <div style={{ flex: 1, overflow: 'auto', padding: 'var(--space-lg)', background: 'var(--bg-light)' }}>
                {messages.length === 0 ? (
                  <p className="text-center text-muted mt-xl">Bắt đầu cuộc trò chuyện với {partner?.full_name}!</p>
                ) : (
                  messages.map(m => (
                    <MessageBubble key={m.id} message={m} partnerName={partner?.full_name || '?'} />
                  ))
                )}
                <div ref={messagesEndRef} />
              </div>

              <form
                onSubmit={handleSend}
                style={{ padding: 'var(--space-md)', borderTop: '1px solid var(--border-color)', display: 'flex', gap: 8 }}
              >
                <input
                  className="form-input flex-1"
                  placeholder="Aa"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  maxLength={1000}
                />
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={!draft.trim()}
                  aria-label="Gửi"
                >
                  ➤
                </button>
              </form>
            </>
          )}
        </main>
      </div>
    </div>
  )
}

function MessageBubble({ message, partnerName }: { message: Message; partnerName: string }) {
  // We can render based on whether current user is sender
  const [isOwn, setIsOwn] = useState(false)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      setIsOwn(user?.id === message.sender_id)
    })
  }, [message.sender_id])

  return (
    <div
      style={{
        display: 'flex',
        justifyContent: isOwn ? 'flex-end' : 'flex-start',
        marginBottom: 12,
      }}
    >
      {!isOwn && (
        <div className="avatar avatar-sm" style={{ marginRight: 8 }}>
          {partnerName.charAt(0)}
        </div>
      )}
      <div
        style={{
          maxWidth: '70%',
          padding: '8px 12px',
          background: isOwn ? 'var(--primary)' : 'white',
          color: isOwn ? 'white' : 'var(--text-primary)',
          borderRadius: 16,
          borderTopLeftRadius: isOwn ? 16 : 4,
          borderTopRightRadius: isOwn ? 4 : 16,
          boxShadow: 'var(--shadow-sm)',
        }}
      >
        <p style={{ wordBreak: 'break-word' }}>{message.content}</p>
        <small style={{ opacity: 0.7, fontSize: 11, display: 'block', marginTop: 4 }}>
          {new Date(message.created_at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
        </small>
      </div>
    </div>
  )
}
