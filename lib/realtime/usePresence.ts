import { useEffect, useState, useCallback, useRef } from 'react'
import { createClient } from '@/utils/supabase/auth'

/**
 * usePresence — track online users on a Supabase Realtime channel.
 *
 * Pattern from Supabase docs: channel.track({ user_id, full_name, online_at }).
 * Each user is one presence entry; the channel maintains a state map.
 *
 * @param channelName - unique room name (e.g. `conv-${id}` or `user-${id}`)
 * @param me - { user_id, full_name } for the current user
 * @returns { presenceUsers, onlineIds }
 *   presenceUsers: array of {user_id, full_name, online_at}
 *   onlineIds: just the IDs (convenience)
 */
export interface PresenceUser {
  user_id: string
  full_name?: string
  online_at: string
}

export function usePresence(
  channelName: string | null,
  me: { user_id: string; full_name?: string } | null,
) {
  const [users, setUsers] = useState<PresenceUser[]>([])
  const channelRef = useRef<any>(null)

  useEffect(() => {
    if (!channelName || !me) return
    const supabase = createClient()
    let channel: ReturnType<typeof supabase.channel> | null = null
    try {
      channel = supabase.channel(channelName, {
        config: { presence: { key: me.user_id } },
      })
      channelRef.current = channel

      channel
        .on('presence', { event: 'sync' }, () => {
          try {
            const state = channel!.presenceState() as Record<string, PresenceUser[]>
            const flat: PresenceUser[] = []
            for (const key of Object.keys(state)) {
              for (const entry of state[key] || []) flat.push(entry)
            }
            setUsers(flat)
          } catch (e) {
            console.warn('[usePresence] presenceState threw', e)
          }
        })
        .subscribe(async (status: string, err?: Error) => {
          if (status === 'SUBSCRIBED') {
            try {
              await channel!.track({
                user_id: me.user_id,
                full_name: me.full_name ?? '',
                online_at: new Date().toISOString(),
              })
            } catch (e) {
              console.warn('[usePresence] track threw', e)
            }
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            console.warn('[usePresence] channel error', err)
          }
        })
    } catch (e) {
      console.warn('[usePresence] subscribe threw', e)
    }

    // heartbeat every 25s
    const hb = setInterval(() => {
      try {
        channel?.track({
          user_id: me.user_id,
          full_name: me.full_name ?? '',
          online_at: new Date().toISOString(),
        })
      } catch {
        /* swallow */
      }
    }, 25_000)

    return () => {
      clearInterval(hb)
      if (channelRef.current === channel) {
        channelRef.current = null
      }
      try {
        if (channel) supabase.removeChannel(channel)
      } catch {
        // Channel may already be gone during fast remounts.
      }
      setUsers([])
    }
  }, [channelName, me?.user_id])

  const onlineIds = users.map((u) => u.user_id)
  return { presenceUsers: users, onlineIds }
}
