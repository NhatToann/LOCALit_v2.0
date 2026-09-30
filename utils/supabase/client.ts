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
    const stored = window.localStorage.getItem(
      // key matches utils/supabase/auth.ts / @supabase/ssr storage layout
      `sb-${new URL(supabase['supabaseUrl'] ?? '').hostname.split('.')[0]}-auth-token`,
    )
    if (!stored) return
    // @supabase/ssr stores a base64-encoded JSON value OR a chunked
    // base64 string (name = `sb-...-auth-token`, then
    // `sb-...-auth-token.1`, `.2`, etc). We can rely on the canonical
    // non-chunked key for the access_token because the JS chunking
    // happens during cookie storage, not localStorage.
    let payload: { access_token?: string } | null = null
    try {
      payload = JSON.parse(atob(stored))
    } catch {
      payload = JSON.parse(stored)
    }
    if (payload?.access_token) {
      supabase.realtime.setAuth(payload.access_token)
    }
  } catch {
    /* noop */
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
  return supabase
}