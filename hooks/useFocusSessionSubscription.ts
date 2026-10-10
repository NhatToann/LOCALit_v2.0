'use client'

/**
 * useFocusSessionSubscription — subscribe to postgres_changes on
 * `focus_sessions` filtered to rows where the current user is
 * `user_a_id` OR `user_b_id`. The hook returns the latest
 * `ended_at` it has seen for the given session id, so the focus
 * page can auto-redirect to /chat when the partner ends the
 * session.
 *
 * The underlying subscription is module-scoped (single channel per
 * page) so multiple components on the same page can register a
 * listener without re-binding `postgres_changes` and tripping the
 * "cannot add postgres_changes callbacks ... after subscribe()"
 * error that hit /focus on 2026-10-10.
 */

import { useEffect, useState } from 'react'
import { createClient } from '@/utils/supabase/auth'

// --- Module-scoped subscription registry -------------------------------

type FocusSessionEvent = {
  eventType: 'INSERT' | 'UPDATE' | 'DELETE' | string
  new: Record<string, unknown> | null
  old: Record<string, unknown> | null
}

interface SessionEntry {
  refCount: number
  channel: ReturnType<ReturnType<typeof createClient>['channel']>
  listeners: Set<(event: FocusSessionEvent) => void>
}

const REGISTRY = new Map<string, SessionEntry>()

function channelNameFor(userId: string): string {
  return `focus-session-${userId}`
}

function subscribeSharedSessionChannel(
  userId: string,
  onEvent: (event: FocusSessionEvent) => void,
): { unsubscribe: () => void; isActive: () => boolean } {
  const name = channelNameFor(userId)
  let entry = REGISTRY.get(name)
  if (!entry) {
    const supabase = createClient()
    const channel = supabase
      .channel(name)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'focus_sessions' },
        (payload) => {
          const reg = REGISTRY.get(name)
          if (!reg) return
          const event: FocusSessionEvent = {
            eventType: payload.eventType,
            new: (payload.new as Record<string, unknown> | null) ?? null,
            old: (payload.old as Record<string, unknown> | null) ?? null,
          }
          for (const listener of reg.listeners) {
            try {
              listener(event)
            } catch {
              /* one bad listener doesn't take down the others */
            }
          }
        },
      )
      .subscribe()
    entry = { refCount: 0, channel, listeners: new Set() }
    REGISTRY.set(name, entry)
  }
  entry.listeners.add(onEvent)
  entry.refCount += 1
  return {
    unsubscribe() {
      const reg = REGISTRY.get(name)
      if (!reg) return
      reg.listeners.delete(onEvent)
      reg.refCount -= 1
      if (reg.refCount <= 0) {
        try {
          reg.channel.unsubscribe()
        } catch {
          /* ignore */
        }
        REGISTRY.delete(name)
      }
    },
    isActive() {
      return REGISTRY.has(name)
    },
  }
}

// --- Hook --------------------------------------------------------------

/**
 * @param sessionId The session id we are currently inside. When the
 *   partner's UPDATE sets `ended_at` to a non-null value on this row,
 *   the hook fires.
 * @param myUserId  The current user's id. Used both for the channel
 *   name and the RLS-aware filter (`user_a_id` OR `user_b_id`).
 * @returns `partnerEndedAt` — ISO string when the partner ended the
 *   session, otherwise null. The focus page watches this and
 *   auto-navigates to /chat when it goes non-null.
 */
export function useFocusSessionSubscription(
  sessionId: string | null,
  myUserId: string | null,
): { partnerEndedAt: string | null } {
  const [partnerEndedAt, setPartnerEndedAt] = useState<string | null>(null)

  useEffect(() => {
    if (!myUserId) return
    let cancelled = false

    const handle = subscribeSharedSessionChannel(myUserId, (event) => {
      if (cancelled) return
      const row = event.new
      if (!row) return
      if (row.id !== sessionId) return
      const endedAt = row.ended_at
      if (typeof endedAt === 'string' && endedAt) {
        setPartnerEndedAt(endedAt)
      }
    })

    return () => {
      cancelled = true
      handle.unsubscribe()
    }
  }, [sessionId, myUserId])

  return { partnerEndedAt }
}
