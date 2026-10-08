import { useEffect, useState, useCallback, useRef } from 'react'
import { createClient } from '@/utils/supabase/auth'
import type { Message, MessageReaction } from '@/lib/types'

/**
 * useMessageStream — subscribe to INSERT / UPDATE / DELETE on messages,
 * plus message_reactions, for a single conversation.
 *
 * The initial messages should be loaded once via REST then handed in via
 * `initial`. New messages get appended; updates replace; deletes soft-remove.
 *
 * @returns { messages, reactionsByMessage, refetch }
 *   reactionsByMessage is grouped as { [message_id]: MessageReaction[] }
 */
export function useMessageStream(
  conversationId: string | null,
  initial: Message[],
  initialReactions: MessageReaction[] = [],
) {
  const [messages, setMessages] = useState<Message[]>(initial)
  const [reactions, setReactions] = useState<MessageReaction[]>(initialReactions)
  const channelRef = useRef<any>(null)

  // Re-seed when initial changes (e.g. conversation switched)
  const lastConv = useRef<string | null>(null)
  useEffect(() => {
    if (conversationId !== lastConv.current) {
      setMessages(initial)
      setReactions(initialReactions)
      lastConv.current = conversationId
    }
  }, [conversationId, initial, initialReactions])

  useEffect(() => {
    if (!conversationId) return
    const supabase = createClient()
    let channel: ReturnType<typeof supabase.channel> | null = null
    try {
      channel = supabase
        .channel(`conv-${conversationId}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'messages',
            filter: `conversation_id=eq.${conversationId}`,
          },
          (payload) => {
            const next = payload.new as Message
            setMessages((prev) => {
              if (prev.some((m) => m.id === next.id)) return prev
              const recent = prev.find(
                (m) =>
                  m.id.startsWith('tmp-') &&
                  m.sender_id === next.sender_id &&
                  m.content === next.content,
              )
              if (recent) return prev.map((m) => (m.id === recent.id ? next : m))
              return [...prev, next]
            })
          },
        )
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'messages',
            filter: `conversation_id=eq.${conversationId}`,
          },
          (payload) => {
            const next = payload.new as Message
            setMessages((prev) => prev.map((m) => (m.id === next.id ? next : m)))
          },
        )
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'message_reactions',
          },
          (payload) => {
            const r = payload.new as MessageReaction
            setReactions((prev) =>
              prev.some((x) => x.id === r.id) ? prev : [...prev, r],
            )
          },
        )
        .on(
          'postgres_changes',
          {
            event: 'DELETE',
            schema: 'public',
            table: 'message_reactions',
          },
          (payload) => {
            const r = payload.old as MessageReaction
            setReactions((prev) => prev.filter((x) => x.id !== r.id))
          },
        )
        .subscribe((status, err) => {
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            if (process.env.NODE_ENV !== 'production') {
              console.warn('[useMessageStream] channel error', err)
            }
          }
        })
      channelRef.current = channel
    } catch (e) {
      if (process.env.NODE_ENV !== 'production') {
        console.warn('[useMessageStream] subscribe threw', e)
      }
    }

    return () => {
      try {
        if (channel) supabase.removeChannel(channel)
      } catch {
        /* swallow */
      }
      channelRef.current = null
    }
  }, [conversationId])

  const refetch = useCallback(async () => {
    if (!conversationId) return
    const supabase = createClient()
    const [msgRes, rxRes] = await Promise.all([
      supabase
        .from('messages')
        .select('*')
        .eq('conversation_id', conversationId)
        .is('deleted_at', null)
        .order('created_at', { ascending: true }),
      supabase
        .from('message_reactions')
        .select('*')
        .order('created_at', { ascending: true }),
    ])
    if (msgRes.data) setMessages(msgRes.data as Message[])
    if (rxRes.data) setReactions(rxRes.data as MessageReaction[])
  }, [conversationId])

  const reactionsByMessage: Record<string, MessageReaction[]> = {}
  for (const r of reactions) {
    if (!reactionsByMessage[r.message_id]) reactionsByMessage[r.message_id] = []
    reactionsByMessage[r.message_id].push(r)
  }

  return { messages, reactions, reactionsByMessage, refetch, setMessages }
}
