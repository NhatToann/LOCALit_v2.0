/**
 * useConnectionState — single source of truth for "what is my relationship
 * with this user right now?".
 *
 * The original `ConnectButton` did its own connections lookup with its
 * own state machine, which meant every page that cared about connection
 * state (chat, itinerary, profile) had to re-implement the same dance.
 * This hook centralises the lookup, derives isLocked / daysRemaining from
 * the API response, and exposes a `mutate` to refresh after accept/reject.
 *
 * The hook is intentionally tiny: it does NOT trigger refetch on
 * notification events (the bell does that). Consumers call mutate() after
 * a write to keep the cached state in sync.
 */
'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

export type ConnectionState = {
  hasConnection: boolean
  status: 'pending' | 'accepted' | 'declined' | null
  direction: 'i_sent' | 'they_sent' | null
  connectionId: string | null
  durationDays: number | null
  expiresAt: string | null
  daysRemaining: number | null
  isLocked: boolean
}

const EMPTY: ConnectionState = {
  hasConnection: false,
  status: null,
  direction: null,
  connectionId: null,
  durationDays: null,
  expiresAt: null,
  daysRemaining: null,
  isLocked: false,
}

export function useConnectionState(targetUserId: string | null | undefined) {
  const [state, setState] = useState<ConnectionState>(EMPTY)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const fetch_ = useCallback(async () => {
    if (!targetUserId) {
      setState(EMPTY)
      setLoading(false)
      return
    }
    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/connections/check?target=${targetUserId}`, {
        signal: ctrl.signal,
        credentials: 'include',
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = (await res.json()) as ConnectionState
      setState(json)
    } catch (e) {
      if ((e as Error).name === 'AbortError') return
      setError((e as Error).message)
    } finally {
      if (!ctrl.signal.aborted) setLoading(false)
    }
  }, [targetUserId])

  useEffect(() => {
    void fetch_()
    return () => abortRef.current?.abort()
  }, [fetch_])

  return { state, loading, error, refetch: fetch_ }
}
