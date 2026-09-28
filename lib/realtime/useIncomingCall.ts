'use client'

/**
 * Subscribe to incoming voice-call notifications.
 *
 * The pending_calls table is the single source of truth for "who is
 * calling whom right now". This hook subscribes via Supabase Realtime
 * (Postgres Changes) for INSERT events where callee_id = current user
 * AND status = 'ringing'. The component layer can then prompt the user
 * to accept or decline.
 *
 * Why not use Realtime broadcast on a channel?
 *   Broadcast is fire-and-forget; if the receiver is not subscribed at
 *   the moment the caller inserts, the notification is lost. Postgres
 *   Changes sends the current row state, and we re-fetch on reconnect.
 */

import { useEffect, useState } from 'react'
import { createClient } from '@/utils/supabase/auth'

export interface IncomingCall {
  pendingCallId: string
  conversationId: string
  callerId: string
  callerName: string
  callerAvatar: string | null
  createdAt: string
}

interface CallerProfileRow {
  id: string
  full_name: string | null
  avatar_url: string | null
}

export function useIncomingCall(currentUserId: string | null): IncomingCall | null {
  const [incoming, setIncoming] = useState<IncomingCall | null>(null)

  useEffect(() => {
    if (!currentUserId) {
      setIncoming(null)
      return
    }
    const supabase = createClient()

    let cancelled = false

    async function hydrateRow(pendingCallId: string): Promise<IncomingCall | null> {
      const { data: row, error } = await supabase
        .from('pending_calls')
        .select('id, conversation_id, caller_id, callee_id, status, created_at')
        .eq('id', pendingCallId)
        .single()
      if (error || !row) return null
      if (row.status !== 'ringing') return null
      if (row.callee_id !== currentUserId) return null

      const { data: profile } = await supabase
        .from('safe_profiles')
        .select('id, full_name, avatar_url')
        .eq('id', row.caller_id)
        .maybeSingle<CallerProfileRow>()

      return {
        pendingCallId: row.id,
        conversationId: row.conversation_id,
        callerId: row.caller_id,
        callerName: profile?.full_name ?? 'Incoming call',
        callerAvatar: profile?.avatar_url ?? null,
        createdAt: row.created_at,
      }
    }

    async function checkMissedOnMount() {
      // Catch any rows that arrived while the user was offline / not subscribed.
      // We only care about 'ringing' rows where the caller_id is active in the
      // last 60s (handled by expires_at on the DB side anyway).
      const { data: rows } = await supabase
        .from('pending_calls')
        .select('id, created_at, expires_at')
        .eq('callee_id', currentUserId)
        .eq('status', 'ringing')
        .order('created_at', { ascending: false })
        .limit(1)
      if (!rows || rows.length === 0) return
      const latest = rows[0]
      if (new Date(latest.expires_at).getTime() < Date.now()) return
      const hydrated = await hydrateRow(latest.id)
      if (!cancelled && hydrated) setIncoming(hydrated)
    }

    void checkMissedOnMount()

    const channel = supabase
      .channel(`incoming-call:${currentUserId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'pending_calls',
          filter: `callee_id=eq.${currentUserId}`,
        },
        async (payload) => {
          const row = payload.new as {
            id: string
            conversation_id: string
            caller_id: string
            callee_id: string
            status: string
            created_at: string
          }
          if (row.status !== 'ringing') return
          // Only show if there isn't already an incoming call surfaced.
          setIncoming((cur) => cur ?? null)
          const hydrated = await hydrateRow(row.id)
          if (!cancelled && hydrated) {
            setIncoming((cur) => cur ?? hydrated)
          }
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'pending_calls',
          filter: `callee_id=eq.${currentUserId}`,
        },
        (payload) => {
          const row = payload.new as { id: string; status: string }
          if (row.status !== 'ringing') {
            setIncoming((cur) => (cur?.pendingCallId === row.id ? null : cur))
          }
        },
      )
      .subscribe()

    return () => {
      cancelled = true
      void supabase.removeChannel(channel)
    }
  }, [currentUserId])

  return incoming
}
