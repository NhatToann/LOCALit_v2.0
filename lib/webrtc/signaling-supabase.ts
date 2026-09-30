/**
 * Raw supabase-js client wrapper for the WebRTC signaling transport.
 *
 * Why this lives in its own module (instead of reusing the @supabase/ssr
 * client in utils/supabase/client.ts):
 *   The ssr client's fetch layer authenticates via HttpOnly cookies that
 *   were set during the SSR round-trip. When we query `webrtc_signals`
 *   from the browser via that client, the access_token never ends up in
 *   the Authorization header — only the cookie session does — so RLS
 *   sees `auth.uid()` as null and returns 0 rows. That broke the
 *   signaling path end-to-end (repro 2026-09-30).
 *
 *   By contrast, a plain `createClient(url, anon, ...)` instance
 *   carrying an explicit Bearer access_token queries RLS correctly.
 *   We only use this for signaling-table I/O so the blast radius is
 *   limited.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_PROJECT_URL ||
  ''

const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  ''

const STORAGE_KEY = (() => {
  try {
    return `sb-${new URL(SUPABASE_URL).hostname.split('.')[0]}-auth-token`
  } catch {
    return 'sb-auth-token'
  }
})()

interface CachedSession {
  access_token: string
  expires_at?: number
}

let cached: { session: CachedSession; client: SupabaseClient } | null = null

function readAccessToken(): string | null {
  if (typeof window === 'undefined') return null
  const stored = window.localStorage.getItem(STORAGE_KEY)
  if (!stored) return null
  try {
    const payload = JSON.parse(atob(stored)) as CachedSession
    if (payload?.access_token) return payload.access_token
  } catch {
    /* try raw JSON */
  }
  try {
    const payload = JSON.parse(stored) as CachedSession
    if (payload?.access_token) return payload.access_token
  } catch {
    /* ignore */
  }
  return null
}

export function getSignalingSupabase(): SupabaseClient {
  const accessToken = readAccessToken()
  if (!accessToken) {
    throw new Error('No active session — cannot access signaling transport')
  }
  // Refresh the cached client only when the token changes (e.g. after
  // a sign-out / sign-in cycle).
  if (cached && cached.session.access_token === accessToken) {
    return cached.client
  }
  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  })
  cached = { session: { access_token: accessToken }, client }
  return client
}

export function clearSignalingSupabase(): void {
  cached = null
}