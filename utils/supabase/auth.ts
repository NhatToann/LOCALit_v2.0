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
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (!error && data.user) {
    notifyAuthChanged()
  }
  return { data, error }
}

export async function signOut() {
  const supabase = createClient()
  const { error } = await supabase.auth.signOut()
  if (!error) {
    notifyAuthChanged()
  }
  return { error }
}

export async function resetPassword(email: string, redirectTo?: string) {
  const supabase = createClient()
  const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: redirectTo ?? `${typeof window !== 'undefined' ? window.location.origin : ''}/reset-password`,
  })
  return { data, error }
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