// Re-export the canonical browser client so callers can use a single import path.
export { createClient } from './client'

import { createBrowserClient } from '@supabase/ssr'

function getBrowserClient() {
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_PROJECT_URL ||
    ''
  const supabaseAnonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    ''
  return createBrowserClient(supabaseUrl, supabaseAnonKey)
}

// Auth helpers — each call uses a fresh browser client so callers don't have to
// worry about leaking session state across requests during signup flows.
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
  return { data, error }
}

export async function signIn(email: string, password: string) {
  const supabase = getBrowserClient()
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  return { data, error }
}

export async function signOut() {
  const supabase = getBrowserClient()
  const { error } = await supabase.auth.signOut()
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

export async function getUserProfile(userId: string) {
  const supabase = getBrowserClient()
  const { data, error } = await supabase
    .from('profiles')
    .select('*, tourists(*), buddies(*)')
    .eq('id', userId)
    .single()
  return { data, error }
}
