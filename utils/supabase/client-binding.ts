/**
 * Browser-side realtime auth binding + session helpers.
 *
 * Extracted from `client.ts` so the canonical `createClient` in `auth.ts`
 * can own the singleton lifecycle without circular re-export traps.
 *
 * `bindRealtimeAuth` reads the @supabase/ssr cookie (or the legacy
 * localStorage entry) and calls `supabase.realtime.setAuth(access_token)`
 * so the Realtime WebSocket authenticates via the access_token query
 * parameter rather than cookies (which fail in cross-domain / multi-tab
 * scenarios). Without this fix, callers sending `calls:<peerId>`
 * broadcasts reach the gateway but the peer's inbound channel never
 * receives the message (observed 2026-09-30).
 */
import type { SupabaseClient } from '@supabase/supabase-js'

export type BrowserSupabaseClient = SupabaseClient<any, 'public'>

function readSessionFromLocalStorage(): { access_token?: string } | null {
  if (typeof window === 'undefined') return null
  const projectRef = new URL(
    process.env.NEXT_PUBLIC_SUPABASE_URL ??
      'https://pqvnjgyqbxlylawwogjv.supabase.co',
  ).hostname.split('.')[0]
  const stored = window.localStorage.getItem(`sb-${projectRef}-auth-token`)
  if (!stored) return null
  try {
    return JSON.parse(atob(stored))
  } catch {
    try {
      return JSON.parse(stored)
    } catch {
      return null
    }
  }
}

/**
 * @supabase/ssr stores the session as a non-HttpOnly cookie named
 * `sb-<project-ref>-auth-token` whose value is `base64-<base64-encoded
 * JSON containing the full session>`.
 */
function readSessionFromCookie(): { access_token?: string } | null {
  if (typeof document === 'undefined') return null
  const projectRef = (() => {
    try {
      return new URL(
        process.env.NEXT_PUBLIC_SUPABASE_URL ??
          'https://pqvnjgyqbxlylawwogjv.supabase.co',
      ).hostname.split('.')[0]
    } catch {
      return null
    }
  })()
  if (!projectRef) return null
  const cookieName = `sb-${projectRef}-auth-token`
  const raw = document.cookie
    .split(';')
    .map((s) => s.trim())
    .find((s) => s.startsWith(`${cookieName}=`))
  if (!raw) return null
  let value = decodeURIComponent(raw.slice(cookieName.length + 1))
  if (value.startsWith('base64-')) value = value.slice('base64-'.length)
  try {
    const b64 = value.replace(/-/g, '+').replace(/_/g, '/')
    return JSON.parse(atob(b64))
  } catch {
    try {
      return JSON.parse(value)
    } catch {
      return null
    }
  }
}

export function readAccessToken(): string | null {
  return (
    readSessionFromLocalStorage()?.access_token ??
    readSessionFromCookie()?.access_token ??
    null
  )
}

/**
 * Idempotent — safe to call multiple times per session. Logs only when
 * NEXT_PUBLIC_CALL_DEBUG=1 (dev-only).
 */
export function bindRealtimeAuth(supabase: BrowserSupabaseClient) {
  if (typeof window === 'undefined') return
  try {
    const accessToken = readAccessToken()
    if (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_CALL_DEBUG === '1') {
      // eslint-disable-next-line no-console
      console.log(
        '[dlog] bindRealtimeAuth: storage=',
        accessToken ? 'present' : 'missing',
      )
    }
    if (!accessToken) return
    supabase.realtime.setAuth(accessToken)
    if (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_CALL_DEBUG === '1') {
      // eslint-disable-next-line no-console
      console.log(
        '[dlog] bindRealtimeAuth: setAuth OK',
        'token prefix',
        accessToken.slice(0, 30),
      )
    }
  } catch (e) {
    if (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_CALL_DEBUG === '1') {
      // eslint-disable-next-line no-console
      console.log('[dlog] bindRealtimeAuth ERR', (e as Error).message)
    }
  }
}