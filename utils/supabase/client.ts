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
function bindRealtimeAuth(supabase: ReturnType<typeof createBrowserClient>) {
  if (typeof window === 'undefined') return
  try {
    const projectRef = new URL(
      process.env.NEXT_PUBLIC_SUPABASE_URL ??
        'https://pqvnjgyqbxlylawwogjv.supabase.co',
    ).hostname.split('.')[0]
    const stored = window.localStorage.getItem(`sb-${projectRef}-auth-token`)
    if (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_CALL_DEBUG === '1') {
      // eslint-disable-next-line no-console
      console.log('[dlog] bindRealtimeAuth: storage=', stored ? 'present' : 'missing')
    }
    if (!stored) return
    // @supabase/ssr stores a base64-encoded JSON value OR a chunked
    // base64 string. We can rely on the canonical non-chunked key for
    // the access_token because the JS chunking happens during cookie
    // storage, not localStorage.
    let payload: { access_token?: string } | null = null
    try {
      // Try base64 first
      payload = JSON.parse(atob(stored))
    } catch {
      try {
        payload = JSON.parse(stored)
      } catch {
        return
      }
    }
    if (payload?.access_token) {
      supabase.realtime.setAuth(payload.access_token)
      if (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_CALL_DEBUG === '1') {
        // eslint-disable-next-line no-console
        console.log(
          '[dlog] bindRealtimeAuth: setAuth OK',
          'token prefix',
          payload.access_token.slice(0, 30),
        )
      }
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