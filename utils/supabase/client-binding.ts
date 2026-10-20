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
 * Read the signed-in user id from the stored access token.
 *
 * WHY THIS EXISTS (2026-10-10)
 * Components that only need "am I signed in, and as whom" were calling
 * `supabase.auth.getUser()`, which is a network round trip to
 * `/auth/v1/user`. A dozen of them mounting on the same page produced ~22
 * identical requests. Swapping in `getSession()` avoided the requests but
 * introduced a worse failure: when the cached token is expired the SDK
 * awaits an internal refresh while holding the auth lock, and a concurrent
 * `getSession()` from another component deadlocks it. The awaiting promise
 * then never settles, so the caller's `finally` never runs and any
 * `loading` flag stays true forever — which is what left the connect
 * button as a permanent spinner.
 *
 * The JWT is already in the cookie; decoding it is synchronous, offline
 * and cannot hang. Callers that genuinely need fresh server-side profile
 * data should still use `getUser()` — this is only for identity.
 *
 * Returns null when signed out or when the token cannot be decoded.
 */
/**
 * Synchronous identity read from the JWT (cookie OR localStorage).
 *
 * Returns null when signed out OR when the token is missing / malformed /
 * lacks GoTrue's standard `sub` claim. Never throws.
 */
export function readUserIdFromToken(): string | null {
  const token = readAccessToken()
  if (!token) return null
  try {
    const payload = token.split('.')[1]
    if (!payload) return null
    const b64 = payload.replace(/-/g, '+').replace(/_/g, '/')
    const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4)
    const json = JSON.parse(atob(padded))
    return typeof json?.sub === 'string' ? json.sub : null
  } catch {
    return null
  }
}

/**
 * Synchronous decode of the JWT payload. Pulls the metadata that the
 * user_metadata GoTrue stores on sign-in (full_name, role) so a
 * re-render of the header right after a page refresh doesn't flash
 * the guest nav for ~300 ms before the profile query lands.
 *
 * Returns `null` when there is no token OR the payload is too old/missing
 * the custom claims (we DO still render via the profile query in that
 * edge case — this is just an opportunity to skip it, not a requirement).
 *
 * Never throws.
 */
export interface SyncJwtClaims {
  userId: string
  email: string | null
  fullName: string | null
  role: 'tourist' | 'buddy' | 'admin' | null
}

export function readJwtClaimsSync(): SyncJwtClaims | null {
  const session = readSessionFromCookie() ?? readSessionFromLocalStorage()
  if (!session?.access_token) return null
  try {
    const payload = session.access_token.split('.')[1]
    if (!payload) return null
    const b64 = payload.replace(/-/g, '+').replace(/_/g, '/')
    const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4)
    const json = JSON.parse(atob(padded))
    const sub = typeof json?.sub === 'string' ? json.sub : null
    if (!sub) return null
    const meta = (json?.user_metadata ?? {}) as { full_name?: unknown; role?: unknown }
    const fullName = typeof meta.full_name === 'string' ? meta.full_name : null
    const roleRaw = typeof meta.role === 'string' ? meta.role.toLowerCase() : null
    const role =
      roleRaw === 'tourist' || roleRaw === 'buddy' || roleRaw === 'admin'
        ? (roleRaw as 'tourist' | 'buddy' | 'admin')
        : null
    const email = typeof json?.email === 'string' ? json.email : null
    return { userId: sub, email, fullName, role }
  } catch {
    return null
  }
}

/**
 * Drop-in replacement for `supabase.auth.getUser()` when you only need the
 * user id.
 *
 * Same shape as the SDK call — `{ user: { id } | null }` — so call sites
 * change by one line:
 *
 *   - const { data: { user } } = await supabase.auth.getUser()
 *   + const { user } = getMyUserSync()
 *
 * WHY (2026-10-10)
 * `getUser()` is a network call to `/auth/v1/user`. Client components were
 * each calling it on mount, and a profile page reached 37 identical requests
 * on one navigation. The request burst was itself the bug: responses landed
 * after the calling effects had been cleaned up, so `cancelled` was true,
 * the state writes were skipped, and `loading` never cleared — the connect
 * button rendered as a permanent spinner and reviews stayed on
 * "Loading reviews…" with no error anywhere.
 *
 * The JWT is already in the auth cookie. Decoding it is synchronous, costs
 * nothing, and cannot be interrupted by a re-render.
 *
 * SERVER-SIDE CAVEAT: this reads a browser cookie. It only works in client
 * components. Server components and route handlers must keep using
 * `supabase.auth.getUser()` against the server client.
 *
 * Returns `{ user: null }` when signed out.
 */
export function getMyUserSync(): { user: { id: string } | null } {
  const id = readUserIdFromToken()
  return { user: id ? { id } : null }
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