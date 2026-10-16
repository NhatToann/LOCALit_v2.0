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
import { readUserIdFromToken } from '@/utils/supabase/client-binding'
import { createClient } from '@/utils/supabase/auth'
import { useConnectionsRealtime } from '@/hooks/useConnectionsRealtime'

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
  // Track whether we've ever run a successful (or 401-gated) fetch for
  // the current target so we don't fire the same query repeatedly when
  // auth state churns.
  const lastFetchedFor = useRef<string | null>(null)
  const lastFetchedAt = useRef<number>(0)

  const fetch_ = useCallback(async (force = false) => {
    if (!targetUserId) {
      setState(EMPTY)
      setLoading(false)
      return
    }
    // De-dupe: if we just fetched this exact target within the last
    // 500ms, skip. Supabase's onAuthStateChange sometimes fires
    // multiple times in the same tick during hydration, each of which
    // would otherwise re-issue the same /api/connections/check.
    // `force=true` bypasses this — used after a write (accept/reject/
    // cancel/renew) so the local state reflects the server state
    // immediately, even if a hydration refetch just ran.
    if (!force && lastFetchedFor.current === targetUserId && Date.now() - lastFetchedAt.current < 500) {
      return
    }
    // Check the local auth cookie synchronously before fetching.
    // The hook can fire before Supabase's JS SDK has finished hydrating
    // the auth state, especially on the very first render of a fresh
    // navigation target — calling /api/connections/check in that
    // window returns 401 and floods the console. We guard with the
    // same JWT decode the rest of the app uses.
    if (typeof window !== 'undefined' && !readUserIdFromToken()) {
      setState(EMPTY)
      setLoading(false)
      return
    }
    lastFetchedFor.current = targetUserId
    lastFetchedAt.current = Date.now()
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
      // 401 means the user is signed out; clear state silently. The
      // 401 error in the console comes from fetch's own logging, not
      // from us, so we suppress the visual error to keep the page clean.
      if (res.status === 401) {
        setState(EMPTY)
        return
      }
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
    let cancelled = false
    let debounceTimer: ReturnType<typeof setTimeout> | null = null
    const debouncedFetch = () => {
      if (debounceTimer) clearTimeout(debounceTimer)
      debounceTimer = setTimeout(() => {
        if (!cancelled) void fetch_()
      }, 50)
    }

    void fetch_()

    // Re-fetch when the auth state flips. The Supabase SDK writes the
    // session cookie on its first getSession() — listening for that
    // event lets us recover when we skipped the initial fetch because
    // the cookie was not yet present. Debounced because onAuthStateChange
    // often fires several times in quick succession on first mount.
    let unsub: (() => void) | null = null
    if (typeof window !== 'undefined') {
      try {
        const supabase = createClient()
        const { data } = supabase.auth.onAuthStateChange(() => {
          debouncedFetch()
        })
        unsub = () => data.subscription.unsubscribe()
      } catch {
        // non-blocking
      }
    }
  return () => {
    cancelled = true
    if (debounceTimer) clearTimeout(debounceTimer)
    abortRef.current?.abort()
    unsub?.()
  }
}, [fetch_])

// Auto-refetch when ANY connection row involving the current user
// changes. This covers the case where the OTHER party (the recipient
// of the request) accepts, rejects, renews, or cancels — none of
// which the local user can detect from their own session, so we
// watch the table for partner-side writes and re-run the /check
// fetch (which is scoped to the targetUserId prop).
useConnectionsRealtime(() => {
  void fetch_()
})

  return { state, loading, error, refetch: () => fetch_(true) }
}
