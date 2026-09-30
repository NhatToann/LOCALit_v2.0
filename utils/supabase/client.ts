import { createBrowserClient } from '@supabase/ssr'

/**
 * Authenticate the Supabase Realtime websocket with the user's JWT.
 *
 * Why we need this:
 *   `@supabase/ssr`'s default realtime client tries to authenticate the
 *   websocket using cookies (HttpOnly session token) sent via the
 *   browser's automatic WebSocket cookie behaviour. In practice this
 *   silently fails in many cross-domain / multi-tab scenarios —
 *   Supabase then prints the warning
 *     "Realtime send() is automatically falling back to REST API"
 *   and realtime broadcasts never reach the client.
 *
 * By calling `supabase.realtime.setAuth(token)` we tell Realtime to
 *   use the access_token query parameter instead, which works
 *   reliably for broadcast (the channel type used by our WebRTC
 *   signaling). Without this fix, callers sending `calls:<peerId>`
 *   broadcasts reach the gateway but the peer's inbound channel never
 *   receives the message (observed 2026-09-30).
 *
 * Idempotent: the helper is a no-op if realtime is already bound.
 */
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
 * JSON containing the full session>`. The SSR client manages this
 * cookie automatically; we can read it from `document.cookie`.
 *
 * We support both the plain `createClient(@supabase/supabase-js)`
 * flow (localStorage) and the `createBrowserClient(@supabase/ssr)`
 * flow (cookies) so callers can mix and match.
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
  // Strip the `base64-` prefix used by @supabase/ssr cookies.
  if (value.startsWith('base64-')) value = value.slice('base64-'.length)
  try {
    // Supabase cookie values are base64url-encoded JSON (the value
    // itself, not its container). The standard base64 decode also
    // handles the URL-safe alphabet with a swap of `-_` for `+/` —
    // but atob() in the browser does not. So we do the swap first.
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

function bindRealtimeAuth(supabase: ReturnType<typeof createBrowserClient>) {
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

export function createClient() {
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_PROJECT_URL ||
    ''

  const supabaseAnonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    ''

  const supabase = createBrowserClient(supabaseUrl, supabaseAnonKey)
  bindRealtimeAuth(supabase)
  // The session can be loaded asynchronously by @supabase/ssr AFTER
  // createClient() returns. If we tried to setAuth only once at boot,
  // we'd miss it. Re-bind on every auth state change so the realtime
  // websocket always carries a fresh access_token.
  supabase.auth.onAuthStateChange((_event, session) => {
    if (session?.access_token) {
      try {
        supabase.realtime.setAuth(session.access_token)
      } catch {
        /* ignore */
      }
    }
  })
  return supabase
}