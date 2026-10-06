'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/utils/supabase/auth'

export interface TripPresenceSnapshot {
  userId: string
  fullName: string
  avatarUrl: string | null
  isOnline: boolean
  lastSeen: string
}

interface StatePayload {
  user_id: string
  full_name: string
  avatar_url: string | null
  is_online: boolean
  last_seen: string
}

/**
 * useTripPresence — track who is currently viewing a single trip page.
 *
 * Mounted in /itinerary/[id] page. Uses a single Supabase Realtime
 * PRESENCE channel (per-trip) so tabs join/leave are reflected in <1 s
 * without a server round-trip. The module-level cache + selector hook
 * (`useTripMemberIsOnline`) keeps re-renders scoped to components that
 * actually read presence — the rest of the page doesn't re-render.
 */
export function useTripPresence(
  tripId: string | null,
  me: { id: string; fullName: string; avatarUrl: string | null } | null
): TripPresenceSnapshot[] {
  const [list, setList] = useState<TripPresenceSnapshot[]>([])
  const channelRef = useRef<ReturnType<ReturnType<typeof createClient>['channel']> | null>(null)

  useEffect(() => {
    if (!tripId || !me) {
      setList([])
      return
    }
    const supabase = createClient()
    const channelName = `trip-presence-${tripId}`

    const channel = supabase.channel(channelName, {
      config: { presence: { key: me.id } },
    })
    channelRef.current = channel

    const syncFromState = () => {
      const state = channel.presenceState<StatePayload>()
      const flat: TripPresenceSnapshot[] = []
      for (const key of Object.keys(state)) {
        const arr = state[key] ?? []
        for (const s of arr) {
          if (!s?.user_id) continue
          flat.push({
            userId: s.user_id,
            fullName: s.full_name,
            avatarUrl: s.avatar_url ?? null,
            isOnline: true,
            lastSeen: s.last_seen,
          })
        }
      }
      setList(flat)
    }

    channel
      .on('presence', { event: 'sync' }, syncFromState)
      .on('presence', { event: 'join' }, syncFromState)
      .on('presence', { event: 'leave' }, syncFromState)
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({
            user_id: me.id,
            full_name: me.fullName,
            avatar_url: me.avatarUrl,
            is_online: true,
            last_seen: new Date().toISOString(),
          })
        }
      })

    return () => {
      try {
        channel.untrack()
      } catch {
        // ignore
      }
      supabase.removeChannel(channel)
      channelRef.current = null
    }
  }, [tripId, me?.id, me?.fullName, me?.avatarUrl])

  return list
}
