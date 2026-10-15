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
    const channel = supabase
      .channel(`conns-${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'connections',
          // The realtime publication can't filter by an OR across two
          // columns, so we subscribe to BOTH filters and let the client
          // de-dupe. Supabase will send each matching event twice (once
          // per filter); `cbRef.current()` is idempotent in practice
          // because `router.refresh()` is a no-op when nothing has
          // changed at the server.
          filter: `requester_id=eq.${userId}`,
        },
        () => {
          try {
            cbRef.current()
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
            cbRef.current()
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

    return () => {
      try {
        supabase.removeChannel(channel)
      } catch {
        /* swallow */
      }
    }
  }, [])
}
