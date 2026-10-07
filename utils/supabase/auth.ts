// Re-export the canonical browser client so callers can use a single import path.
export { createClient } from './client'

import { createBrowserClient } from '@supabase/ssr'

// RAM OPTIMIZATION (2026-10-08): previous implementation created a fresh
// Supabase client on every call (signUp/signIn/signOut/resetPassword/etc.).
// Every fresh client opens its own Realtime WebSocket and Auth state
// machine — under React's re-render cycle this leaked RAM (and WebSocket
// connections) until the GC caught up, sometimes 30–60s after a route
// change. We now cache one browser client per JS realm and reuse it.
let _browserClient: ReturnType<typeof createBrowserClient> | null = null

function getBrowserClient(): ReturnType<typeof createBrowserClient> {
  if (_browserClient) return _browserClient
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_PROJECT_URL ||
    ''
  const supabaseAnonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    ''
  _browserClient = createBrowserClient(supabaseUrl, supabaseAnonKey)
  return _browserClient
}

// Auth helpers — single shared browser client so re-renders don't open
// extra Realtime sockets.
export async function signUp(email: string, password: string, fullName: string, role: 'tourist' | 'buddy') {
  const supabase = getBrowserClient()
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
  const supabase = getBrowserClient()
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (!error && data.user) {
    notifyAuthChanged()
  }
  return { data, error }
}

export async function signOut() {
  const supabase = getBrowserClient()
  const { error } = await supabase.auth.signOut()
  if (!error) {
    notifyAuthChanged()
  }
  return { error }
}

export async function resetPassword(email: string, redirectTo?: string) {
  const supabase = getBrowserClient()
  const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: redirectTo ?? `${typeof window !== 'undefined' ? window.location.origin : ''}/reset-password`,
  })
  return { data, error }
}

export async function updatePassword(newPassword: string) {
  const supabase = getBrowserClient()
  const { data, error } = await supabase.auth.updateUser({ password: newPassword })
  return { data, error }
}

export async function getCurrentUser() {
  const supabase = getBrowserClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return null
  return user
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

export async function getUserProfile(userId: string) {
  const supabase = getBrowserClient()
  const { data, error } = await supabase
    .from('profiles')
    .select('*, tourists(*), buddies(*)')
    .eq('id', userId)
    .single()
  return { data, error }
}
