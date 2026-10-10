'use client'

/**
 * MessagePopover — global toast popover for incoming chat messages.
 *
 * 2026-10-10: per user request, incoming chat messages now surface
 * as a small popover in the bottom-right of any authenticated
 * page — same pattern as the FocusRequestPopover. Clicking the
 * popover deep-links to /chat?conv=<id>.
 *
 * What this is NOT:
 *   - Not a notification bell replacement. The bell is still the
 *     persistent record; the popover is a glanceable toast.
 *   - Not a chat replacement. /chat still has the full message
 *     list; the popover is a single-message alert.
 *
 * Filtering strategy:
 *   - On mount, fetch every conversation the user is a member of
 *     (`tourist_id = me.id` OR `buddy_id = me.id`).
 *   - Subscribe to `postgres_changes` on `messages` filtered to
 *     those conversation ids. The Supabase Realtime filter syntax
 *     is `conversation_id=in.(<comma-separated-uuids>)`.
 *   - Drop any message where `sender_id === me.id` (don't notify
 *     the user about their own messages — defensive, the filter
 *     shouldn't pass them in but better safe).
 *
 * The popover auto-dismisses after 6 s. The user can also click
 * the × to dismiss early, or click the body to jump to /chat.
 */

import { useEffect, useRef, useState, useCallback } from 'react'
import { MessageCircle, X } from 'lucide-react'
import { createClient } from '@/utils/supabase/auth'
import { navigate } from '@/lib/navigation'

interface Toast {
  id: string
  conversationId: string
  senderId: string
  senderName: string
  body: string
  preview: string
  createdAt: string
}

interface Props {
  userId: string | null
}

const TOAST_TTL_MS = 6_000
const PREVIEW_LEN = 80

export default function MessagePopover({ userId }: Props) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const timerRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())
  const convIdsRef = useRef<string[]>([])
  const userIdRef = useRef<string | null>(userId)

  // Keep the ref in sync so the subscription effect (which only runs
  // when userId changes) can read the latest id without re-binding.
  useEffect(() => {
    userIdRef.current = userId
  }, [userId])

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
    const handle = timerRef.current.get(id)
    if (handle) {
      clearTimeout(handle)
      timerRef.current.delete(id)
    }
  }, [])

  const pushToast = useCallback(
    (toast: Toast) => {
      // Dedupe by message id — Realtime can fire the same INSERT
      // twice in rare reconnect scenarios.
      setToasts((prev) => {
        if (prev.some((t) => t.id === toast.id)) return prev
        return [...prev, toast]
      })
      const handle = setTimeout(() => dismiss(toast.id), TOAST_TTL_MS)
      timerRef.current.set(toast.id, handle)
    },
    [dismiss],
  )

  // Hydrate the conversation-id set on mount (and whenever the user
  // id changes — fresh sign-in).
  useEffect(() => {
    if (!userId) {
      convIdsRef.current = []
      return
    }
    let cancelled = false
    void (async () => {
      try {
        const supabase = createClient()
        // `conversations` rows are filtered by RLS to rows where
        // tourist_id or buddy_id matches auth.uid(). We just need
        // the ids.
        const { data } = await supabase
          .from('conversations')
          .select('id')
          .limit(500)
        if (cancelled) return
        convIdsRef.current = (data ?? []).map((c) => c.id)
      } catch {
        /* ignore */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [userId])

  // Subscribe to message INSERTs.
  useEffect(() => {
    if (!userId) return
    const supabase = createClient()
    const channelName = `message-popover-${userId}`

    // Re-fetch conversation ids at subscribe time too, in case
    // hydration finished before/after the effect ran.
    void (async () => {
      const { data } = await supabase
        .from('conversations')
        .select('id')
        .limit(500)
      const ids = (data ?? []).map((c) => c.id)
      if (ids.length > 0) convIdsRef.current = ids
    })()

    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
        },
        async (payload) => {
          const row = payload.new as {
            id: string
            conversation_id: string
            sender_id: string
            content: string
            message_type?: string
            created_at: string
          }
          if (!row || !row.id) return
          if (row.sender_id === userIdRef.current) return
          // Only show for conversations the user is a member of.
          if (!convIdsRef.current.includes(row.conversation_id)) return
          // System / call_event rows are already surfaced by the
          // focus popover + chat pills. Don't double-notify.
          if (
            row.message_type === 'system' ||
            row.message_type === 'call_event'
          ) {
            return
          }
          // Hydrate sender name.
          let senderName = 'Your buddy'
          try {
            const { data: sender } = await supabase
              .from('safe_profiles')
              .select('full_name')
              .eq('id', row.sender_id)
              .maybeSingle()
            if (sender?.full_name) senderName = sender.full_name
          } catch {
            /* fall back to default */
          }
          const preview =
            row.content.length > PREVIEW_LEN
              ? row.content.slice(0, PREVIEW_LEN) + '…'
              : row.content
          pushToast({
            id: row.id,
            conversationId: row.conversation_id,
            senderId: row.sender_id,
            senderName,
            body: row.content,
            preview,
            createdAt: row.created_at,
          })
        },
      )
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [userId, pushToast])

  // Clean up timers on unmount.
  useEffect(() => {
    return () => {
      for (const handle of timerRef.current.values()) {
        clearTimeout(handle)
      }
      timerRef.current.clear()
    }
  }, [])

  if (toasts.length === 0) return null

  return (
    <div
      role="region"
      aria-label="Incoming messages"
      className="fixed bottom-4 right-4 z-[90] flex flex-col-reverse gap-2 max-w-[min(360px,calc(100vw-2rem))]"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          role="status"
          className="bg-paper border border-border rounded-sm overflow-hidden"
          style={{ boxShadow: 'var(--shadow-focus)' }}
        >
          <button
            type="button"
            onClick={() => {
              dismiss(t.id)
              navigate(`/chat?conv=${t.conversationId}`)
            }}
            className="w-full text-left flex items-start gap-3 p-3 hover:bg-surface focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            aria-label={`Open message from ${t.senderName}: ${t.preview}`}
          >
            <span
              className="flex-shrink-0 inline-flex items-center justify-center w-8 h-8 rounded-sm bg-info-bg text-info"
              aria-hidden="true"
            >
              <MessageCircle size={14} />
            </span>
            <span className="flex-1 min-w-0">
              <span className="block text-sm font-semibold text-ink truncate">
                {t.senderName}
              </span>
              <span className="block text-xs text-muted mt-0.5 line-clamp-2">
                {t.preview}
              </span>
            </span>
          </button>
          <button
            type="button"
            onClick={() => dismiss(t.id)}
            className="absolute top-1 right-1 p-1 text-muted hover:text-ink"
            aria-label="Dismiss"
          >
            <X size={12} aria-hidden="true" />
          </button>
        </div>
      ))}
    </div>
  )
}
