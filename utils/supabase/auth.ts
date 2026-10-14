/**
 * Singleton browser-side Supabase client + auth helpers.
 *
 * RAM OPTIMIZATION (2026-10-08):
 * The previous implementation created a fresh client on every
 * `createClient()` call. With 44 client modules importing it, this opened
 * a fresh Realtime WebSocket per call — under React's re-render cycle the
 * WebSocket count grew unbounded (observed 47 bindRealtimeAuth calls in
 * 30s on /dashboard, see scripts/diag-map-realtime-leak.mjs).
 *
 * The singleton is initialized lazily on first access and reused across
 * the page session. The `bindRealtimeAuth` lifecycle hook and the
 * `onAuthStateChange` subscription are each registered ONCE per session.
 *
 * Auth helpers (`signIn`, `signUp`, etc.) share the same singleton so
 * the realtime websocket stays stable across sign-in / sign-out.
 */
import { createBrowserClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'
import { bindRealtimeAuth } from './client-binding'

export type BrowserSupabaseClient = SupabaseClient<any, 'public'>

let _client: BrowserSupabaseClient | null = null
let _initialized = false

export function createClient(): BrowserSupabaseClient {
  if (_client && _initialized) return _client

  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_PROJECT_URL ||
    ''

  const supabaseAnonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    ''

  if (!_client) {
    _client = createBrowserClient(supabaseUrl, supabaseAnonKey)
  }

  if (!_initialized) {
    bindRealtimeAuth(_client)
    // Re-bind on every auth state change so the realtime websocket
    // always carries a fresh access_token. Registered ONCE per page
    // session — the previous implementation re-registered per
    // createClient() call, which leaked subscription closures.
    _client.auth.onAuthStateChange((_event, session) => {
      if (session?.access_token) {
        try {
          _client?.realtime.setAuth(session.access_token)
        } catch {
          /* ignore */
        }
      }
    })
    _initialized = true
  }

  return _client
}

/**
 * Fires a window-level event so listeners (e.g. AppShell's AuthAwareHeader)
 * can immediately re-evaluate auth state without waiting for
 * `onAuthStateChange` to fire (which can be delayed when the SDK has just
 * written a fresh cookie on the same tick as the redirect).
 */
function notifyAuthChanged() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('localit-auth-changed'))
  }
}

export async function signUp(email: string, password: string, fullName: string, role: 'tourist' | 'buddy') {
  const supabase = createClient()
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: fullName,
        role,
      },
    },
  })
  if (!error && data.user) {
    notifyAuthChanged()
  }
  return { data, error }
}

export async function signIn(email: string, password: string) {
  const supabase = createClient()

  // Clear any pre-existing session BEFORE signing in. Without this,
  // `signInWithPassword` runs against whatever account was already
  // in the cookie, and on a stale/expired session it can leave the
  // browser holding the OLD account's token while the UI renders the
  // NEW account's dashboard. Symptom: the header shows a signed-in
  // user but every RLS-scoped query returns 0 rows, so chat shows
  // "Start chatting" for conversations that clearly have messages.
  const { data: existing } = await supabase.auth.getSession()
  if (existing.session) {
    await supabase.auth.signOut()
  }

  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (!error && data.user) {
    notifyAuthChanged()
  }
  return { data, error }
}

/**
 * Sign out and clear every trace of the session.
 *
 * `supabase.auth.signOut()` alone is not always enough on this stack:
 * the @supabase/ssr browser client persists the session to a
 * chunked cookie, and a mid-flight sign-in can leave the code-verifier
 * cookies from the previous OAuth/OTP attempt behind. Those orphan
 * cookies keep tripping the middleware's "is this an auth route and
 * is there a user" check, which is how users got stranded on a
 * previous account with no way back to the login form.
 *
 * Clearing the cookies first and doing a hard reload guarantees the
 * next page load starts from a genuinely empty session.
 */
export async function signOut() {
  const supabase = createClient()
  const { error } = await supabase.auth.signOut()

  // Best-effort sweep of any orphaned Supabase auth cookies.
  if (typeof document !== 'undefined') {
    const prefix = 'sb-'
    for (const c of document.cookie.split(';')) {
      const name = c.split('=')[0]?.trim()
      if (!name || !name.startsWith(prefix)) continue
      document.cookie = `${name}=; Max-Age=0; path=/`
      document.cookie = `${name}=; Max-Age=0; path=/; domain=${location.hostname}`
    }
  }

  if (!error) {
    notifyAuthChanged()
  }
  return { error }
}

/**
 * Canonical production origin used for auth redirect URLs.
 *
 * WHY THIS EXISTS (2026-10-10)
 * ----------------------------
 * The reset flow broke because `redirectPasswordForEmail` was sending
 * `window.location.origin` as the redirect target. That origin is the
 * DEPLOYMENT hostname (`localit-16e8n0qic-nhattoann.vercel.app`) when
 * you arrive via a preview/hash URL, and every new deployment mints a
 * brand-new hostname. GoTrue only honours a `redirect_to` that matches
 * the project's allowlist; on a miss it silently discards the path and
 * bounces the user to the Site URL root with:
 *
 *   /?error=access_denied&error_code=otp_expired
 *
 * — which is exactly the broken link that was reported. Worse, it
 * *looked* like a session-leak bug (the page rendered the previous
 * account's name), so it was easy to misdiagnose.
 *
 * Pinning the redirect to the two stable aliases means the URL works
 * from ANY deployment hostname, present or future, with no per-deploy
 * dashboard edit.
 */
const CANONICAL_ORIGINS = [
  'https://localit-nhattoann.vercel.app',
  'https://localit-vn.vercel.app',
] as const

/**
 * Pick the best redirect origin for the current page.
 *
 * Preference order:
 *   1. `NEXT_PUBLIC_SITE_URL` if set (explicit operator override).
 *   2. The current origin, when it is already one of the stable
 *      aliases or a local dev server.
 *   3. The primary canonical alias.
 *
 * A deployment hash URL deliberately falls through to (3): those rotate
 * on every deploy and are not on the allowlist.
 */
function resolveAuthOrigin(): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim()
  if (configured) return configured.replace(/\/$/, '')

  if (typeof window !== 'undefined') {
    const current = window.location.origin
    const isLocal =
      current.startsWith('http://localhost') || current.startsWith('http://127.0.0.1')
    if (isLocal) return current
    // Reuse the alias the user is already on when it is a stable one.
    if ((CANONICAL_ORIGINS as readonly string[]).includes(current)) return current
  }

  return CANONICAL_ORIGINS[0]
}

export async function resetPassword(email: string, redirectTo?: string) {
  const supabase = createClient()
  const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: redirectTo ?? `${resolveAuthOrigin()}/reset-password`,
  })
  return { data, error }
}

/**
 * Classify a Supabase auth error into a user-actionable reason.
 *
 * WHY THIS EXISTS (2026-10-10)
 * The reset flow swallowed every failure behind one generic sentence,
 * so a hard per-recipient email throttle (`over_email_send_rate_limit`)
 * looked identical to a typo'd address. Users retried in a tight loop,
 * which kept the throttle raised.
 *
 * `resetPasswordForEmail` returns 200 for unknown addresses on purpose
 * (no email enumeration), so we must read the error CODE rather than the
 * status to decide what to tell the user.
 */
export type AuthErrorKind =
  | 'email_throttled'
  | 'rate_limited'
  | 'network'
  | 'unknown'

export function classifyResetError(error: unknown): {
  kind: AuthErrorKind
  message: string
} {
  const status =
    typeof error === 'object' && error !== null && 'status' in error
      ? Number((error as { status?: number }).status)
      : 0

  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code?: string }).code ?? '')
      : ''

  // `over_email_send_rate_limit` is per-recipient and can stay raised for
  // a while after repeated requests. It is NOT fixed by waiting 30s.
  if (code === 'over_email_send_rate_limit' || status === 429) {
    return {
      kind: 'email_throttled',
      message:
        'We have already sent several reset emails to this address in a short time. ' +
        'Please wait about an hour before trying again, or sign in with your current password.',
    }
  }

  if (status === 0) {
    return {
      kind: 'network',
      message: 'Could not reach the server. Check your connection and try again.',
    }
  }

  return {
    kind: 'unknown',
    message: 'Could not send the reset email. Please wait a minute and try again.',
  }
}

export async function updatePassword(newPassword: string) {
  const supabase = createClient()
  const { data, error } = await supabase.auth.updateUser({ password: newPassword })
  return { data, error }
}

export async function getCurrentUser() {
  const supabase = createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return null
  return user
}

export async function getUserProfile(userId: string) {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('profiles')
    .select('*, tourists(*), buddies(*)')
    .eq('id', userId)
    .single()
  return { data, error }
}