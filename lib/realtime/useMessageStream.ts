import { useEffect, useState, useCallback, useRef } from 'react'
import { createClient } from '@/utils/supabase/auth'
import type { Message, MessageReaction } from '@/lib/types'

const EMPTY_REACTIONS: MessageReaction[] = []

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
/**
 * Shallow-by-key comparison for message/reaction arrays.
 *
 * The reseed effects below must NOT rely on reference identity: some
 * callers pass a fresh array literal on every render (e.g.
 * `useMessageStream(id, msgs, [])` in MiniChatWindow), which made the
 * effect fire on every render -> setState -> re-render -> new array
 * -> infinite loop ("Maximum update depth exceeded").
 */
function sameById<T extends { id: string }>(a: T[], b: T[]): boolean {
  if (a === b) return true
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (a[i]?.id !== b[i]?.id) return false
  }
  return true
}

export function useMessageStream(
  conversationId: string | null,
  initial: Message[],
  initialReactions: MessageReaction[] = EMPTY_REACTIONS,
) {
  const [messages, setMessages] = useState<Message[]>(initial)
  const [reactions, setReactions] = useState<MessageReaction[]>(initialReactions)
  const channelRef = useRef<any>(null)

  // Re-seed whenever the parent's `initial` payload changes.
  // The previous version only reseeded when `conversationId`
  // changed, which left a race: when the user switches from
  // conv1 → conv2 and the parent's `loadMessages(conv2)` is
  // still in flight when this effect fires, the hook would
  // adopt conv1's stale `initial` array AND set
  // `lastConv.current = conv2`. The subsequent re-render with
  // conv2's real data wouldn't reseed (the
  // `conversationId !== lastConv.current` guard was now false)
  // so `messages` was stuck on conv1's data even though the
  // active conversation was conv2. The user saw "Lan's
  // messages don't match Phan's" because two browsers were
  // showing two different conversations' message lists until
  // a hard reload.
  //
  // The new logic: whenever `initial` arrives, reseed. The
  // dedupe check in the INSERT handler (matched on tmp-* id)
  // still protects against losing optimistic bubbles, and the
  // hook's own `messages` never carries optimistic state —
  // those live in FocusChat's `localAppends` queue.
  const lastInitialRef = useRef<Message[] | null>(null)
  useEffect(() => {
    if (!sameById(initial, lastInitialRef.current ?? [])) {
      setMessages(initial)
      lastInitialRef.current = initial
    }
  }, [initial])
  const lastInitialReactionsRef = useRef<MessageReaction[] | null>(null)
  useEffect(() => {
    if (!sameById(initialReactions, lastInitialReactionsRef.current ?? [])) {
      setReactions(initialReactions)
      lastInitialReactionsRef.current = initialReactions
    }
  }, [initialReactions])

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
