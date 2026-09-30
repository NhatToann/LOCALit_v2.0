/**
 * Direct supabase-js broadcast test using access_token (matches smoke test).
 * Verifies whether broadcast delivery works at all on production when we
 * skip @supabase/ssr cookies entirely.
 */

import { chromium } from 'playwright'
import { createClient } from '@supabase/supabase-js'

const API_BASE = process.env.API_BASE ?? 'https://localit-vn.vercel.app'
const SUPABASE_URL =
  process.env.SUPABASE_URL ?? 'https://pqvnjgyqbxlylawwogjv.supabase.co'
const ANON_KEY =
  process.env.SUPABASE_ANON_KEY ??
  'sb_publishable_3uRUZqdvazd4cENt8WOWJA_SB7HmCEE'

const BUDDY_EMAIL = process.env.BUDDY_EMAIL ?? 'lan.pham@localit.dev'
const BUDDY_PASSWORD = process.env.BUDDY_PASSWORD ?? 'password123'
const TOURIST_EMAIL = process.env.TOURIST_EMAIL ?? 'john.doe@example.com'
const TOURIST_PASSWORD = process.env.TOURIST_PASSWORD ?? 'password123'

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
  return { accessToken: json.access_token, userId: json.user.id }
}

async function browserWithToken(browser, label, session) {
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
        user: {
          id: session.userId,
          aud: 'authenticated',
          role: 'authenticated',
        },
      }),
    ],
  )
  const page = await ctx.newPage()
  page.on('console', (m) => {
    const t = m.text()
    if (/Download the React DevTools/i.test(t)) return
    if (/Realtime|falling back|Warning|RealtimeClient|warning|error/i.test(t)) {
      console.log(`  [${label}:realtime] ${m.type()} ${t.slice(0, 200)}`)
    }
  })
  return { ctx, page }
}

async function main() {
  console.log('[raw-test] signing in two users')
  const buddySession = await signIn(BUDDY_EMAIL, BUDDY_PASSWORD)
  const touristSession = await signIn(TOURIST_EMAIL, TOURIST_PASSWORD)
  console.log(`  buddy=${buddySession.userId} tourist=${touristSession.userId}`)

  const browser1 = await chromium.launch()
  const browser2 = await chromium.launch()
  const buddy = await browserWithToken(browser1, 'buddy', buddySession)
  const tourist = await browserWithToken(browser2, 'tourist', touristSession)

  // Both navigate to /chat (or any page) to load @supabase/ssr.
  await buddy.page.goto('/chat')
  await buddy.page.waitForTimeout(3000)
  await tourist.page.goto('/chat')
  await tourist.page.waitForTimeout(3000)

  // Now, from each browser, create a RAW supabase-js client (not ssr)
  // using the same access token, and verify they can broadcast.
  const testCode = `
    (async () => {
      const supabase = window.__supabase_for_test
      const result = { subscribed: false, recvCount: 0, channel: 'calls:' + window.__myId }
      await new Promise((r) => setTimeout(r, 100))
      const chan = supabase.channel(result.channel, {
        config: { broadcast: { self: false, ack: false } },
      })
      chan.on('broadcast', { event: 'echo' }, (raw) => {
        result.recvCount++
        console.log('[echo]', raw.payload)
      })
      await new Promise((r) => {
        chan.subscribe((s) => {
          if (s === 'SUBSCRIBED') {
            result.subscribed = true
            r()
          }
          if (s === 'CHANNEL_ERROR' || s === 'TIMED_OUT' || s === 'CLOSED') r()
        })
      })
      window.__chan = chan
      window.__result = result
      return result
    })()
  `

  // Load supabase-js into both pages
  for (const [name, p, sess] of [['buddy', buddy.page, buddySession], ['tourist', tourist.page, touristSession]]) {
    await p.evaluate(
      ([u, k, t, myId]) => {
        return import('https://esm.sh/@supabase/supabase-js@2').then(({ createClient }) => {
          window.__supabase_for_test = createClient(u, k, {
            global: { headers: { Authorization: 'Bearer ' + t } },
          })
          window.__supabase_for_test.realtime.setAuth(t)
          window.__myId = myId
        })
      },
      [SUPABASE_URL, ANON_KEY, sess.accessToken, sess.userId],
    )
  }

  await buddy.page.waitForTimeout(500)
  await tourist.page.waitForTimeout(500)

  // Buddy subscribes its own channel
  console.log('[raw-test] buddy subscribes its own channel')
  const buddySub = await buddy.page.evaluate(testCode)
  console.log('  buddySub', buddySub)

  // Tourist broadcasts to buddy's channel
  console.log('[raw-test] tourist broadcasts to buddy channel')
  await tourist.page.evaluate(
    ([targetUserId, msg]) => {
      const supabase = window.__supabase_for_test
      const chan = supabase.channel('calls:' + targetUserId, {
        config: { broadcast: { self: false, ack: false } },
      })
      return new Promise((r) => {
        chan.subscribe(async (s) => {
          if (s === 'SUBSCRIBED') {
            await chan.send({ type: 'broadcast', event: 'echo', payload: msg })
            r({ sent: true, msg })
          }
          if (s === 'CHANNEL_ERROR' || s === 'TIMED_OUT') r({ sent: false, status: s })
        })
      })
    },
    [buddySession.userId, { hello: 'tourist-to-buddy', at: Date.now() }],
  )

  await buddy.page.waitForTimeout(5000)
  const finalResult = await buddy.page.evaluate(() => window.__result)
  console.log('  finalResult', finalResult)

  await browser1.close()
  await browser2.close()

  if (finalResult.recvCount > 0) {
    console.log('[raw-test] BROADCAST WORKS via raw supabase-js')
    process.exit(0)
  } else {
    console.log('[raw-test] BROADCAST FAILED via raw supabase-js')
    process.exit(1)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})