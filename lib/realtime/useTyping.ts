import { useEffect, useRef, useState, useCallback } from 'react'
import { createClient } from '@/utils/supabase/auth'

/**
 * useTyping — broadcast typing indicator on a channel.
 * Pattern from Supabase docs: use a broadcast channel + debounced sends.
 *
 * @param conversationId - the conversation we are typing in
 * @param myUserId - current user
 * @returns { typingUsers, notifyTyping }
 *   typingUsers: array of {user_id, at} for users currently typing (excludes self)
 *   notifyTyping: call this from onChange of the input; auto-debounces
 */
export interface TypingPeer {
  user_id: string
  full_name?: string
  at: number
}

export function useTyping(conversationId: string | null, myUserId: string | null, peerNames?: Record<string, string>) {
  const [peers, setPeers] = useState<TypingPeer[]>([])
  const channelRef = useRef<ReturnType<typeof createClient>['channel'] extends (id: string) => infer R ? R : never | null>(null)
  const lastSentRef = useRef<number>(0)

  useEffect(() => {
    if (!conversationId || !myUserId) return
    const supabase = createClient()
    const channel = supabase.channel(`typing-${conversationId}`, {
      config: { broadcast: { self: false } },
    })
    channelRef.current = channel

    channel
      .on('broadcast', { event: 'typing' }, ({ payload }) => {
        if (!payload || payload.user_id === myUserId) return
        setPeers((prev) => {
          const without = prev.filter((p) => p.user_id !== payload.user_id)
          return [...without, { user_id: payload.user_id, at: Date.now(), full_name: peerNames?.[payload.user_id] }]
        })
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
      channelRef.current = null
      setPeers([])
    }
  }, [conversationId, myUserId, peerNames])

  // Auto-clear stale typing entries after 4s
  useEffect(() => {
    const id = setInterval(() => {
      setPeers((prev) => prev.filter((p) => Date.now() - p.at < 4000))
    }, 1500)
    return () => clearInterval(id)
  }, [])

  const notifyTyping = useCallback(() => {
    if (!channelRef.current || !myUserId) return
    const now = Date.now()
    if (now - lastSentRef.current < 1500) return
    lastSentRef.current = now
    channelRef.current.send({
      type: 'broadcast',
      event: 'typing',
      payload: { user_id: myUserId, at: now },
    })
  }, [myUserId])

  return { typingPeers: peers, notifyTyping }
}
