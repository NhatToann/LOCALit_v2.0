'use client'

/**
 * FocusChat — embedded chat bubble UI for the Focus Mode page.
 *
 * Reuses the same `conversations` + `messages` tables as /chat so the
 * two surfaces (regular chat and focus chat) see the same data in
 * real time. The user explicitly asked for messages to show as
 * bubbles inside Focus Mode instead of a link to /chat.
 *
 * Lightweight send flow: the chat page uses an optimistic insert
 * (tmp-* id), then the postgres_changes event replaces the temp row
 * with the real one. We do the same here for parity.
 *
 * No reactions, no replies, no typing indicator — keep the
 * embedded UI focused on send/read for the focus session.
 *
 * 2026-10-10 — also render `message_type='system'` and `'call_event'`
 * rows as centered muted pills so the focus lifecycle events
 * (started / accepted / declined / ended) appear inline in the
 * conversation thread, not just in the chat sidebar.
 */

import { useEffect, useRef, useState } from 'react'
import { Send, MapPinPlus, Phone } from 'lucide-react'
import { createClient } from '@/utils/supabase/auth'
import { useMessageStream } from '@/lib/realtime/useMessageStream'
import type { Message } from '@/lib/types'

interface FocusChatProps {
  conversationId: string
  myId: string
  partnerName: string
}

const MAX_MESSAGE_LEN = 500
// Throttle so a held-down Enter doesn't flood the table. The chat
// page uses 700ms — match that.
const SEND_THROTTLE_MS = 700

export default function FocusChat({ conversationId, myId, partnerName }: FocusChatProps) {
  const [initialMessages, setInitialMessages] = useState<Message[]>([])
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Local optimistic queue — declared BEFORE send() so the
  // function's closure binds the live setter. (Originally this
  // was declared below send() and only worked because React
  // guarantees the closure runs after the first render — easy to
  // break in a refactor.)
  const [localAppends, setLocalAppends] = useState<Message[]>([])
  const lastSentRef = useRef(0)
  const scrollRef = useRef<HTMLDivElement | null>(null)

  // Hydrate the existing messages on mount / conversation switch.
  useEffect(() => {
    let cancelled = false
    async function load() {
      const supabase = createClient()
      const { data, error: e } = await supabase
        .from('messages')
        .select('*')
        .eq('conversation_id', conversationId)
        .is('deleted_at', null)
        .order('created_at', { ascending: true })
        .limit(200)
      if (cancelled) return
      if (e) {
        setError(e.message)
        return
      }
      setInitialMessages((data ?? []) as Message[])
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [conversationId])

  const { messages } = useMessageStream(conversationId, initialMessages)

  // Computed display list. Declared early so the auto-scroll
  // effect below can reference it.
  const displayMessages: Message[] = [...messages, ...localAppends]

  // Auto-scroll to bottom on new message. Both the realtime INSERT
  // (messages.length changes) and the optimistic-insert path
  // (localAppends.length changes) need to trigger a scroll, otherwise
  // the sender can drop a new bubble at the bottom of the list while
  // looking at the top and miss it entirely. rAF defers the scroll
  // until after the DOM has actually updated (otherwise the new
  // message's height isn't in scrollHeight yet and we'd yank to the
  // wrong position).
  const lastMessageIdRef = useRef<string | null>(null)
  useEffect(() => {
    if (typeof window === 'undefined') return
    const last = displayMessages[displayMessages.length - 1]
    if (!last) return
    // Avoid yanking the user back down when they're scrolling up
    // to read old messages — only auto-scroll on a brand-new
    // tail message id. Re-renders that don't add a new tail are
    // ignored.
    if (lastMessageIdRef.current === last.id) return
    lastMessageIdRef.current = last.id
    const raf = requestAnimationFrame(() => {
      if (!scrollRef.current) return
      // Scroll the chat div to the bottom. We do NOT touch the
      // window scroll position — that was the old "tận footer"
      // bug where the whole page scrolled because the parent
      // flex chain lost its min-height constraint for a frame.
      const el = scrollRef.current
      el.scrollTop = el.scrollHeight
    })
    return () => cancelAnimationFrame(raf)
  }, [displayMessages.length, localAppends.length, messages.length])

  async function send() {
    const content = draft.trim()
    if (!content || sending) return
    if (content.length > MAX_MESSAGE_LEN) {
      setError(`Message too long (max ${MAX_MESSAGE_LEN}).`)
      return
    }
    const now = Date.now()
    if (now - lastSentRef.current < SEND_THROTTLE_MS) {
      setError('Please wait a moment before sending another message.')
      return
    }
    lastSentRef.current = now
    setSending(true)
    setError(null)
    const supabase = createClient()
    const tempId = `tmp-${myId}-${now}`
    const optimistic: Message = {
      id: tempId,
      conversation_id: conversationId,
      sender_id: myId,
      content,
      is_read: false,
      message_type: 'text',
      reply_to_id: null,
      edited_at: null,
      deleted_at: null,
      metadata: null,
      created_at: new Date().toISOString(),
    }
    // Use the local message list for the optimistic insert so the
    // bubble appears immediately. The realtime stream will swap the
    // temp row for the real one when the postgres_changes event
    // fires. We don't push into the hook's setMessages (it's not
    // exported), so the temp row will appear duplicated for ~1s.
    // Workaround: append a window-local copy and filter on render.
    setLocalAppends((prev) => [...prev, optimistic])
    setDraft('')
    const { error: sendErr } = await supabase
      .from('messages')
      .insert({
        conversation_id: conversationId,
        sender_id: myId,
        content,
        message_type: 'text',
      })
    if (sendErr) {
      setError(sendErr.message)
      // Drop the optimistic row on failure.
      setLocalAppends((prev) => prev.filter((m) => m.id !== tempId))
    }
    setSending(false)
  }

  // Local optimistic queue — see comment above. The realtime stream
  // deduplicates against this on the render path.
  // (The state declaration itself is now at the top of the
  // component so the send() closure binds the live setter without
  // any temporal-dead-zone surprises.)
  useEffect(() => {
    if (localAppends.length === 0) return
    // Once the realtime stream has absorbed the matching real row
    // (matched by sender_id + content), drop the temp row.
    const sig = (m: { sender_id: string; content: string }) => `${m.sender_id}|${m.content}`
    const real = new Set(messages.map(sig))
    setLocalAppends((prev) => prev.filter((m) => !real.has(sig(m))))
  }, [messages, localAppends.length])

  return (
    <div className="flex flex-col h-full bg-focus-surface border-t border-focus-border">
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-3 py-3 space-y-1.5"
        aria-live="polite"
      >
        {displayMessages.length === 0 ? (
          <p className="text-sm text-focus-muted text-center py-6">
            No messages yet. Say hi to {partnerName.split(' ')[0]}.
          </p>
        ) : (
          displayMessages.map((m) => {
            // System / call_event rows render as centered pills, not
            // bubbles. The chat page handles this the same way.
            if (m.message_type === 'system' || m.message_type === 'call_event') {
              return (
                <div key={m.id} className="flex items-center justify-center my-1">
                  <span
                    className="inline-flex items-center gap-2 px-3 py-1 text-[11px] font-medium text-focus-primary bg-focus-bg border border-focus-border rounded-sm"
                    title={new Date(m.created_at).toLocaleString('en-US')}
                  >
                    {m.message_type === 'system' ? (
                      <MapPinPlus size={11} aria-hidden="true" className="text-focus-primary" />
                    ) : (
                      <Phone size={11} aria-hidden="true" className="text-focus-muted" />
                    )}
                    <span>{m.content}</span>
                    <span aria-hidden="true">·</span>
                    <time
                      dateTime={m.created_at}
                      className="font-mono tracking-tight text-focus-muted"
                    >
                      {new Date(m.created_at).toLocaleTimeString('en-US', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </time>
                  </span>
                </div>
              )
            }
            return (
              <FocusBubble
                key={m.id}
                message={m}
                mine={m.sender_id === myId}
              />
            )
          })
        )}
      </div>
      {error ? (
        <p
          className="px-3 py-1 text-xs text-danger border-t border-focus-border bg-focus-bg"
          role="alert"
        >
          {error}
        </p>
      ) : null}
      <form
        onSubmit={(e) => {
          e.preventDefault()
          void send()
        }}
        className="flex items-center gap-2 px-3 py-2 border-t border-focus-border bg-focus-bg"
      >
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          maxLength={MAX_MESSAGE_LEN}
          placeholder="Type a message…"
          aria-label="Message draft"
          className="flex-1 px-3 py-2 text-sm border border-focus-border rounded-sm bg-focus-surface text-focus-text focus:outline-none focus:border-focus-primary"
        />
        <button
          type="submit"
          disabled={!draft.trim() || sending}
          aria-label="Send message"
          className="inline-flex items-center justify-center w-9 h-9 rounded-sm bg-focus-primary text-white border border-focus-primary hover:bg-focus-primary-dark disabled:opacity-50"
        >
          <Send size={14} aria-hidden="true" />
        </button>
      </form>
    </div>
  )
}

function FocusBubble({ message, mine }: { message: Message; mine: boolean }) {
  return (
    <div className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[78%] px-3 py-2 rounded-sm text-sm leading-snug ${
          mine
            ? 'bg-focus-primary text-white'
            : 'bg-focus-bg border border-focus-border text-focus-text'
        }`}
      >
        <span className="whitespace-pre-wrap break-words">{message.content}</span>
        <time
          className={`block mt-1 text-[10px] ${
            mine ? 'text-white/70' : 'text-focus-muted'
          }`}
          dateTime={message.created_at}
        >
          {new Date(message.created_at).toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </time>
      </div>
    </div>
  )
}
