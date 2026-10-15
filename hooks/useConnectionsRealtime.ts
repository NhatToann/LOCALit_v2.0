'use client'

/**
 * useConnectionsRealtime — subscribe to INSERT / UPDATE / DELETE on
 * public.connections, filtered to rows the current user participates
 * in. Calls `onChange` whenever the user's own connections change
 * (because either party updated the row), and `onChange` typically
 * fires `router.refresh()` so any server-component-derived list
 * (e.g. /connections) re-runs its server fetch.
 *
 * Why a separate hook and not a side-effect inside each page:
 *   - /connections and /buddies/[id] are independent surfaces.
 *     Mounting the channel on each one would open a separate WS.
 *     AppShell already exists as a "single place to mount global
 *     subscriptions" — we keep that, but the hook is also safe to
 *     mount on a leaf page if AppShell isn't on the route.
 *
 * Why we re-fire onChange for ALL events (not just 'accepted'):
 *   The recipient's "Sent requests" section should also remove
 *   rows that the partner rejected / cancelled / renewed. We don't
 *   want the listener to second-guess the schema.
 *
 * Note: requires the migration
 *   supabase/migrations/2026-10-15-connections-realtime.sql
 * to have been applied. Without it, postgres_changes emits no
 * events for connections and this hook becomes a no-op (the
 * subscription still opens, just nothing fires).
 */

import { useEffect, useRef } from 'react'
import { createClient } from '@/utils/supabase/auth'
import { readUserIdFromToken } from '@/utils/supabase/client-binding'

/**
 * Module-level cache so that multiple `useConnectionsRealtime` callers
 * in the same render tree (e.g. ConnectionDataProvider +
 * ConnectionExplainerSection + ConnectActionButton all use
 * useConnectionState → all call this hook) share ONE realtime channel
 * instead of fighting to subscribe the same `conns-${userId}` name
 * twice. Supabase throws "cannot add `postgres_changes` callbacks
 * for realtime:conns-... after `subscribe()`" when a 2nd caller tries
 * to `.on()` on a channel that has already been subscribed.
 */
const sharedChannels = new Map<
  string,
  { channel: ReturnType<ReturnType<typeof createClient>['channel']>; subs: number }
>()

function getOrCreateSharedChannel(
  userId: string,
  supabase: ReturnType<typeof createClient>,
  onChange: () => void,
) {
  const key = `conns-${userId}`
  const existing = sharedChannels.get(key)
  if (existing) {
    existing.subs += 1
    return existing.channel
  }
  const channel = supabase
    .channel(key)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'connections',
        // The realtime publication can't filter by an OR across two
        // columns, so we subscribe to BOTH filters and let the client
        // de-dupe. Supabase will send each matching event twice (once
        // per filter); `onChange` is idempotent in practice because
        // `router.refresh()` is a no-op when nothing has changed at
        // the server.
        filter: `requester_id=eq.${userId}`,
      },
      () => {
        try {
          onChange()
        } catch {
          /* swallow */
        }
      },
    )
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'connections',
        filter: `recipient_id=eq.${userId}`,
      },
      () => {
        try {
          onChange()
        } catch {
          /* swallow */
        }
      },
    )
    .subscribe((status) => {
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        if (process.env.NODE_ENV !== 'production') {
          console.warn('[useConnectionsRealtime] channel error', status)
        }
      }
    })
  sharedChannels.set(key, { channel, subs: 1 })
  return channel
}

export function useConnectionsRealtime(onChange: () => void) {
  // Latest onChange without re-running the subscribe effect.
  const cbRef = useRef(onChange)
  useEffect(() => {
    cbRef.current = onChange
  }, [onChange])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const userId = readUserIdFromToken()
    if (!userId) return

    const supabase = createClient()
    const channel = getOrCreateSharedChannel(userId, supabase, () => {
      try {
        cbRef.current()
      } catch {
        /* swallow */
      }
    })

    return () => {
      // Only tear down the shared channel when the LAST consumer unmounts.
      const key = `conns-${userId}`
      const entry = sharedChannels.get(key)
      if (!entry) return
      entry.subs -= 1
      if (entry.subs <= 0) {
        sharedChannels.delete(key)
        try {
          supabase.removeChannel(channel)
        } catch {
          /* swallow */
        }
      }
    }
  }, [])
}
