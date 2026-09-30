/**
 * Playwright voice-call REPRODUCTION test (2026-09-30).
 *
 * Purpose: prove that the current prod code REPRODUCES the reported
 * bugs before we touch any source files. After fixes are applied,
 * the same test should PASS — which is our sign that the fix is real.
 *
 * Bugs we expect to reproduce on current prod:
 *   1. Buddy sees incoming popup, clicks Accept → no CallModal OR
 *      CallModal stuck on "Connecting…" past 30 s.
 *   2. After ending the first call (or declining), the Voice-call
 *      button on /chat no longer starts a new call cleanly.
 *
 * No hardcoded userIds. Real Supabase Auth login via env vars:
 *   BUDDY_EMAIL, BUDDY_PASSWORD, TOURIST_EMAIL, TOURIST_PASSWORD
 *   API_BASE (default https://localit-vn.vercel.app)
 *   SUPABASE_URL, SUPABASE_ANON_KEY (defaults included)
 *
 * Usage:
 *   API_BASE=https://localit-vn.vercel.app \
 *   BUDDY_EMAIL=lan.pham@localit.dev BUDDY_PASSWORD=password123 \
 *   TOURIST_EMAIL=john.doe@example.com TOURIST_PASSWORD=password123 \
 *     node scripts/playwright-call-repro.mjs
 */

import { chromium } from 'playwright'

const API_BASE = process.env.API_BASE ?? 'https://localit-vn.vercel.app'
const SUPABASE_URL =
  process.env.SUPABASE_URL ?? 'https://pqvnjgyqbxlylawwogjv.supabase.co'
const ANON_KEY =
  process.env.SUPABASE_ANON_KEY ??
  'sb_publishable_3uRUZqdvazd4cENt8WOWJA_SB7HmCEE'
const BUDDY_EMAIL = process.env.BUDDY_EMAIL
const BUDDY_PASSWORD = process.env.BUDDY_PASSWORD
const TOURIST_EMAIL = process.env.TOURIST_EMAIL
const TOURIST_PASSWORD = process.env.TOURIST_PASSWORD

for (const v of [
  ['BUDDY_EMAIL', BUDDY_EMAIL],
  ['BUDDY_PASSWORD', BUDDY_PASSWORD],
  ['TOURIST_EMAIL', TOURIST_EMAIL],
  ['TOURIST_PASSWORD', TOURIST_PASSWORD],
]) {
  if (!v[1]) {
    console.error(`Missing ${v[0]} env var`)
    process.exit(2)
  }
}

/**
 * Sign in via Supabase Auth REST API.
 */
async function signIn(email, password) {
  const res = await fetch(
    `${SUPABASE_URL}/auth/v1/token?grant_type=password`,
    {
      method: 'POST',
      headers: { apikey: ANON_KEY, 'content-type': 'application/json' },
      body: JSON.stringify({ email, password }),
    },
  )
  if (!res.ok) {
    throw new Error(`signIn failed: ${res.status} ${await res.text()}`)
  }
  const json = await res.json()
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    userId: json.user.id,
    email: json.user.email,
    password,
  }
}

async function buildContext(browser, session) {
  const context = await browser.newContext({
    permissions: ['microphone'],
    baseURL: API_BASE,
  })
  // Seed the auth cookie in the format @supabase/ssr expects:
  // base64-encoded JSON, optionally chunked at 3180 chars.
  const projectRef = new URL(SUPABASE_URL).hostname.split('.')[0]
  const storageKey = `sb-${projectRef}-auth-token`
  const value = JSON.stringify({
    access_token: session.accessToken,
    refresh_token: session.refreshToken,
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    token_type: 'bearer',
    user: {
      id: session.userId,
      email: session.email,
      aud: 'authenticated',
      role: 'authenticated',
    },
  })
  const encoded = Buffer.from(value, 'utf-8').toString('base64')
  const cookies = []
  if (encoded.length <= 3180) {
    cookies.push({
      name: storageKey,
      value: encoded,
      domain: new URL(API_BASE).hostname,
      path: '/',
      sameSite: 'Lax',
    })
  } else {
    let i = 0
    let pos = 0
    while (pos < encoded.length) {
      const piece = encoded.slice(pos, pos + 3180)
      cookies.push({
        name: i === 0 ? storageKey : `${storageKey}.${i}`,
        value: piece,
        domain: new URL(API_BASE).hostname,
        path: '/',
        sameSite: 'Lax',
      })
      i++
      pos += 3180
    }
  }
  await context.addCookies(cookies)
  await context.addInitScript(
    ([key, val]) => localStorage.setItem(key, val),
    [storageKey, value],
  )
  return context
}

/**
 * Drive the /login form if the cookie seed didn't survive page reload.
 */
async function ensureSignedIn(page, session) {
  await page.goto('/chat')
  await page.waitForLoadState('domcontentloaded', { timeout: 10_000 })
  await page.waitForTimeout(1500)
  if (!page.url().includes('/login')) return
  console.log(`[repro] driving /login form for ${session.email}`)
  await page.locator('#email').fill(session.email)
  await page.locator('#password').fill(session.password)
  await Promise.all([
    page.waitForURL((url) => !url.toString().includes('/login'), { timeout: 15_000 }),
    page.locator('button[type="submit"]').click(),
  ])
}

async function getOrCreateConversation() {
  const r = await fetch(`${API_BASE}/api/debug/voice-call-test?create=1`)
  if (!r.ok) throw new Error(`getOrCreateConversation: ${r.status} ${await r.text()}`)
  const body = await r.json()
  if (!body?.conversationId) throw new Error(`missing conversationId: ${JSON.stringify(body)}`)
  return body
}

async function cleanRinging() {
  await fetch(`${API_BASE}/api/debug/voice-call-test`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'clean-ringing' }),
  }).catch(() => undefined)
}

async function setOnline(session) {
  await fetch(`${SUPABASE_URL}/rest/v1/rpc/set_online_status`, {
    method: 'POST',
    headers: {
      apikey: ANON_KEY,
      authorization: `Bearer ${session.accessToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ p_is_online: true }),
  }).catch(() => undefined)
}

function attachConsoleLogger(page, label) {
  page.on('console', (m) => {
    const t = m.text()
    if (/Download the React DevTools/i.test(t)) return
    console.log(`  [${label}:console] ${m.type()} ${t}`)
  })
  page.on('pageerror', (e) =>
    console.log(`  [${label}:pageerror] ${e.message}`),
  )
  // Surface the active call store + RTCPeerConnection state for
  // debugging the Connecting → connected hang.
  page.on('console', async (m) => {
    const t = m.text()
    if (!/\[dlog\]|\[call:/.test(t)) return
    console.log(`  [${label}:verbose] ${t}`)
  })
}

/**
 * Wait until both call modals indicate `connected` state via the
 * MM:SS timer inside the aria-live region.
 */
async function waitForConnected(touristPage, buddyPage, label, timeoutMs = 30_000) {
  const touristModal = touristPage.locator('[role="dialog"][aria-modal="true"]').first()
  const buddyModal = buddyPage.locator('[role="dialog"][aria-modal="true"]').first()
  const deadline = Date.now() + timeoutMs
  let lastLog = 0
  while (Date.now() < deadline) {
    const [tText, bText] = await Promise.all([
      touristModal.locator('p[aria-live="polite"]').first().textContent().catch(() => ''),
      buddyModal.locator('p[aria-live="polite"]').first().textContent().catch(() => ''),
    ])
    const now = Date.now()
    if (now - lastLog > 1500) {
      console.log(`  ${label} t=${Math.round((now - (deadline - timeoutMs)) / 1000)}s tourist="${tText}" buddy="${bText}"`)
      lastLog = now
    }
    const tStr = (tText ?? '').trim()
    const bStr = (bText ?? '').trim()
    if (/^\d{2}:\d{2}$/.test(tStr) || /^\d{2}:\d{2}$/.test(bStr)) return true
    if (/call failed|could not start/i.test(tStr) || /call failed/i.test(bStr)) {
      throw new Error(`Call failed early: tourist="${tText}" buddy="${bText}"`)
    }
    await touristPage.waitForTimeout(500)
  }
  return false
}

async function endCallOnTourist(touristPage) {
  await touristPage.locator('button[aria-label="End call"]').first().click()
  await touristPage.waitForTimeout(3500)
}

async function runOneCall(touristPage, buddyPage, label) {
  console.log(`[repro] ${label}: tourist clicks Voice call`)
  const callBtn = touristPage
    .locator('button:has-text("Voice call"), button[aria-label*="Voice call"]')
    .first()
  await callBtn.waitFor({ state: 'visible', timeout: 15_000 })
  const disabled = await callBtn.getAttribute('disabled')
  if (disabled !== null) {
    await touristPage.screenshot({ path: `scripts/screenshots/call-repro-${label}-btn-disabled.png` })
    throw new Error('Voice call button disabled (buddy appears offline)')
  }
  await callBtn.click()

  const touristModal = touristPage.locator('[role="dialog"][aria-modal="true"]').first()
  await touristModal.waitFor({ state: 'visible', timeout: 10_000 })

  console.log(`[repro] ${label}: waiting for buddy popup`)
  const buddyPopup = buddyPage
    .locator('[role="alertdialog"][aria-label="Incoming voice call"]')
    .first()
  await buddyPopup.waitFor({ state: 'visible', timeout: 20_000 })

  console.log(`[repro] ${label}: buddy clicks Accept`)
  await buddyPopup.locator('button[aria-label="Accept call"]').click()
  await buddyPage.waitForURL((url) => url.toString().includes('call='), { timeout: 10_000 })
  const buddyModal = buddyPage.locator('[role="dialog"][aria-modal="true"]').first()
  await buddyModal.waitFor({ state: 'visible', timeout: 10_000 })

  console.log(`[repro] ${label}: waiting for connected state (≤ 30 s)`)
  const ok = await waitForConnected(touristPage, buddyPage, label, 30_000)
  if (!ok) {
    await touristPage.screenshot({ path: `scripts/screenshots/call-repro-${label}-fail-tourist.png` })
    await buddyPage.screenshot({ path: `scripts/screenshots/call-repro-${label}-fail-buddy.png` })
    throw new Error(`${label} did not reach connected state`)
  }
  console.log(`  ${label} CONNECTED`)

  console.log(`[repro] ${label}: tourist ends call`)
  await endCallOnTourist(touristPage)
}

async function main() {
  console.log(`[repro] api=${API_BASE}`)
  console.log('[repro] signing in via Supabase Auth…')
  const buddySession = await signIn(BUDDY_EMAIL, BUDDY_PASSWORD)
  const touristSession = await signIn(TOURIST_EMAIL, TOURIST_PASSWORD)
  console.log(`  buddy=${buddySession.userId} tourist=${touristSession.userId}`)

  console.log('[repro] marking both sides online…')
  await Promise.all([setOnline(buddySession), setOnline(touristSession)])

  console.log('[repro] cleaning ringing + getting conversation…')
  await cleanRinging()
  const conv = await getOrCreateConversation()
  console.log(`  conversation=${conv.conversationId}`)

  console.log('[repro] launching two browser instances…')
  const browser1 = await chromium.launch({
    args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
  })
  const browser2 = await chromium.launch({
    args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
  })
  const buddyCtx = await buildContext(browser1, buddySession)
  const touristCtx = await buildContext(browser2, touristSession)
  const buddyPage = await buddyCtx.newPage()
  const touristPage = await touristCtx.newPage()
  attachConsoleLogger(buddyPage, 'buddy')
  attachConsoleLogger(touristPage, 'tourist')

  console.log('[repro] buddy navigates to /chat')
  await ensureSignedIn(buddyPage, buddySession)
  await buddyPage.waitForTimeout(2000)
  const buddyCookies = await buddyCtx.cookies()
  console.log(`  buddy has ${buddyCookies.length} cookies`)
  for (const c of buddyCookies) {
    if (c.name.includes('auth-token')) {
      console.log(`    ${c.name} (len ${c.value.length})`)
    }
  }

  console.log('[repro] tourist navigates to /chat with conversation id')
  await ensureSignedIn(touristPage, touristSession)
  await touristPage.goto(`/chat?c=${conv.conversationId}`)
  await touristPage.waitForTimeout(4000)
  await touristPage.screenshot({ path: 'scripts/screenshots/call-repro-pre-call.png', fullPage: true })

  // Call #1 — should connect
  await runOneCall(touristPage, buddyPage, 'call#1')

  // Call #2 — regression: must work after ending first call
  await runOneCall(touristPage, buddyPage, 'call#2-regression')

  console.log('[repro] ALL CHECKS PASSED — both calls reached connected state on both sides')
  await browser1.close()
  await browser2.close()
  process.exit(0)
}

main().catch((err) => {
  console.error('FATAL:', err)
  process.exit(1)
})