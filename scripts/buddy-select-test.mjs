/**
 * Quick test to verify the buddy's browser can SELECT from webrtc_signals
 * via the supabase-js client. Used to verify RLS + cookie auth works.
 */

import { chromium } from 'playwright'

const SUPABASE_URL =
  process.env.SUPABASE_URL ?? 'https://pqvnjgyqbxlylawwogjv.supabase.co'
const ANON_KEY =
  process.env.SUPABASE_ANON_KEY ??
  'sb_publishable_3uRUZqdvazd4cENt8WOWJA_SB7HmCEE'
const API_BASE = process.env.API_BASE ?? 'https://localit-vn.vercel.app'
const BUDDY_EMAIL = process.env.BUDDY_EMAIL ?? 'lan.pham@localit.dev'
const BUDDY_PASSWORD = process.env.BUDDY_PASSWORD ?? 'password123'

async function signIn(email, password) {
  const res = await fetch(
    `${SUPABASE_URL}/auth/v1/token?grant_type=password`,
    {
      method: 'POST',
      headers: { apikey: ANON_KEY, 'content-type': 'application/json' },
      body: JSON.stringify({ email, password }),
    },
  )
  const json = await res.json()
  return { accessToken: json.access_token, userId: json.user.id, email, password: json.password ?? password }
}

async function main() {
  const session = await signIn(BUDDY_EMAIL, BUDDY_PASSWORD)
  console.log('signed in as', session.userId)

  const browser = await chromium.launch()
  const ctx = await browser.newContext({ baseURL: API_BASE })
  await ctx.addInitScript(
    ([key, val]) => localStorage.setItem(key, val),
    [
      `sb-${new URL(SUPABASE_URL).hostname.split('.')[0]}-auth-token`,
      JSON.stringify({
        access_token: session.accessToken,
        token_type: 'bearer',
        expires_in: 3600,
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        refresh_token: 'fake',
        user: { id: session.userId, aud: 'authenticated', role: 'authenticated' },
      }),
    ],
  )
  const page = await ctx.newPage()
  page.on('console', (m) => {
    if (/warning|error|dlog/i.test(m.type()) || /dlog/.test(m.text())) {
      console.log(`[browser] ${m.type()} ${m.text().slice(0, 200)}`)
    }
  })
  await page.goto('/chat')
  await page.waitForTimeout(3000)

  // Inject supabase-js into the page so we can run a SELECT against
  // webrtc_signals with the same auth as the running app.
  await page.evaluate(
    ([u, k, t]) => {
      return import('https://esm.sh/@supabase/supabase-js@2').then(
        ({ createClient }) => {
          window.__supabase = createClient(u, k)
          window.__supabase.realtime.setAuth(t)
        },
      )
    },
    [SUPABASE_URL, ANON_KEY, session.accessToken],
  )
  await page.waitForTimeout(500)

  const result = await page.evaluate(
    async ([url, key, token]) => {
      const supabase = window.__supabase ?? null
      if (!supabase) return { error: 'no supabase on window' }
      try {
        const { data, error } = await supabase
          .from('webrtc_signals')
          .select('id, kind, created_at')
          .eq('to_user_id', '11111111-1111-1111-1111-111111111111')
          .limit(5)
        return { data, error: error ? { message: error.message, code: error.code } : null }
      } catch (e) {
        return { error: e.message }
      }
    },
    [SUPABASE_URL, ANON_KEY, session.accessToken],
  )
  console.log('result:', JSON.stringify(result, null, 2))
  await browser.close()
}

main().catch(console.error)
