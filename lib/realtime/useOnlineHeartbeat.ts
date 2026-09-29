'use client'

/**
 * useOnlineHeartbeat — single source of truth for "is this user online".
 *
 * Why this exists (2026-09-30 — Phase 1 of presence rewrite):
 *   profiles.is_online was read by 12+ queries but never auto-set.
 *   Tourists (e.g. John) logged in and stayed "offline" forever; buddies
 *   had a manual toggle that stuck at "online" after they closed the
 *   tab. The result was that the marketplace, chat header, and
 *   voice-call gate all read stale data.
 *
 * Strategy (Phase 1 — heartbeat-driven):
 *   - Mount on AppShell so it runs on every authenticated page.
 *   - On mount + every 30 s while the tab is visible, call the
 *     SECURITY DEFINER RPC `public.set_online_status(true)` which
 *     updates profiles.is_online + last_seen atomically.
 *   - When the tab is hidden for > 5 min OR the user signs out
 *     (via `localit-auth-changed`), call `set_online_status(false)`.
 *   - `beforeunload` fires a best-effort beacon to set false
 *     (browsers don't await async on unload, but a synchronous
 *     fire-and-forget RPC works for the common case).
 *   - Defensive: the pg_cron job `localit-mark-stale-offline`
 *     flips rows to false after 90 s of silence regardless, so a
 *     closed-network tab cannot keep "online" forever.
 *
 * Phase 2 (separate work) will layer a Realtime presence channel on
 * top so chat can show "online now" in sub-second time and override
 * stale DB values.
 */

import { useEffect, useRef } from 'react'
import { createClient } from '@/utils/supabase/auth'

const HEARTBEAT_MS = 30_000 // 30s cadence — cron uses 90s stale window (3× slack)
const HIDDEN_OFFLINE_AFTER_MS = 5 * 60_000 // 5 min hidden → set offline
const RPC_NAME = 'set_online_status'

function dlog(...args: unknown[]): void {
  if (process.env.NODE_ENV === 'production') return
  // eslint-disable-next-line no-console
  console.debug('[presence]', ...args)
}

/**
 * Fire-and-forget RPC call. The session cookie is sent automatically by
 * the browser; SECURITY DEFINER on the RPC enforces auth.uid() ownership.
 */
async function callSetOnline(isOnline: boolean): Promise<void> {
  try {
    const supabase = createClient()
    const { error } = await supabase.rpc(RPC_NAME, { p_is_online: isOnline })
    if (error) {
      // Session may have expired between mount and now; that's expected
      // during sign-out. Other failures are logged but not retried — the
      // cron job will eventually reconcile.
      if (process.env.NODE_ENV !== 'production') {
        // eslint-disable-next-line no-console
        console.warn('[presence] rpc failed:', error.message)
      }
    }
  } catch (err) {
    if (process.env.NODE_ENV !== 'production') {
      // eslint-disable-next-line no-console
      console.warn('[presence] rpc threw:', err)
    }
  }
}

export function useOnlineHeartbeat(currentUserId: string | null): void {
  // eslint-disable-next-line no-console
  console.log('[presence] hook rendered with userId=', currentUserId)
  // Refs survive strict-mode double-mount without re-creating intervals.
  const lastOnlineAtRef = useRef<number>(0)
  const heartbeatTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const hiddenSinceRef = useRef<number | null>(null)
  const currentUserIdRef = useRef<string | null>(null)

  useEffect(() => {
    currentUserIdRef.current = currentUserId
    if (!currentUserId) {
      // User signed out — clear timers, no RPC needed (the auth state
      // change handler will fire a final offline RPC separately).
      stopHeartbeat(heartbeatTimerRef)
      return
    }

    // 1) Mark online on mount (may run twice in StrictMode — second call
    // is a no-op UPDATE).
    void callSetOnline(true)
    lastOnlineAtRef.current = Date.now()
    dlog('mounted for', currentUserId, '— set online=true')

    // 2) Periodic heartbeat (visibility-gated below).
    heartbeatTimerRef.current = setInterval(() => {
      // Only heartbeat when the tab is visible. Hidden tabs are handled
      // by the visibilitychange listener.
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return
      void callSetOnline(true)
      lastOnlineAtRef.current = Date.now()
    }, HEARTBEAT_MS)

    // 3) Visibility — track when the tab first went hidden so we can
    // auto-offline after HIDDEN_OFFLINE_AFTER_MS of inactivity.
    function onVisibilityChange() {
      if (typeof document === 'undefined') return
      if (document.visibilityState === 'hidden') {
        if (hiddenSinceRef.current == null) hiddenSinceRef.current = Date.now()
        // Don't immediately flip offline — short background tabs are
        // normal (e.g. switching apps). The cron + the 5-min timeout
        // handle the rest.
      } else {
        // Visible again — set online immediately and reset hidden timer.
        hiddenSinceRef.current = null
        void callSetOnline(true)
        lastOnlineAtRef.current = Date.now()
      }
    }
    document.addEventListener('visibilitychange', onVisibilityChange)

    // 4) Periodic check: if we've been hidden > threshold, flip offline
    // (and clear the interval so we don't keep retrying).
    const hiddenCheckTimer = setInterval(() => {
      const since = hiddenSinceRef.current
      if (since != null && Date.now() - since >= HIDDEN_OFFLINE_AFTER_MS) {
        dlog('hidden > 5min — set online=false')
        void callSetOnline(false)
        // Don't reset hiddenSinceRef — wait for visibilitychange→visible
        // to flip back. cron will catch if user closes tab here.
      }
    }, 30_000)

    // 5) beforeunload — best-effort final offline. We can't await async
    // here but the RPC call is small enough that most browsers fire it
    // before tearing down. The pg_cron job is the safety net.
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
    function onBeforeUnload() {
      if (!currentUserIdRef.current || !supabaseUrl) return
      try {
        dlog('beforeunload — set online=false (best-effort)')
        // Use fetch+keepalive. The auth cookie is sent automatically.
        // We deliberately don't await — the browser fires this in
        // parallel with the unload.
        const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
        void fetch(`${supabaseUrl}/rest/v1/rpc/${RPC_NAME}`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            apikey: anonKey,
            // No Authorization header — the cookie is sent by the
            // browser automatically because Supabase stores the
            // session in a cookie via the SSR client.
          },
          body: JSON.stringify({ p_is_online: false }),
          keepalive: true,
        }).catch(() => undefined)
      } catch {
        /* swallow — best effort */
      }
    }
    window.addEventListener('beforeunload', onBeforeUnload)

    // 6) Sign-out hook: the auth layer fires `localit-auth-changed`
    // when sign-out completes (see utils/supabase/auth.ts). On that
    // event we flip offline once and stop heartbeating.
    function onLocalAuthChanged() {
      dlog('localit-auth-changed — set online=false, stop heartbeat')
      void callSetOnline(false)
      stopHeartbeat(heartbeatTimerRef)
    }
    window.addEventListener('localit-auth-changed', onLocalAuthChanged)

    return () => {
      // Cleanup — runs on unmount AND on userId change.
      dlog('unmount — set online=false (next user will flip back)')
      void callSetOnline(false)
      stopHeartbeat(heartbeatTimerRef)
      clearInterval(hiddenCheckTimer)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      window.removeEventListener('beforeunload', onBeforeUnload)
      window.removeEventListener('localit-auth-changed', onLocalAuthChanged)
      hiddenSinceRef.current = null
    }
    // We intentionally re-run when currentUserId changes (sign in /
    // sign out). The hook is otherwise self-contained.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUserId])
}

function stopHeartbeat(
  ref: React.MutableRefObject<ReturnType<typeof setInterval> | null>,
) {
  if (ref.current) {
    clearInterval(ref.current)
    ref.current = null
  }
}
