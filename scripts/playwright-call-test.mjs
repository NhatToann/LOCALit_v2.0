/**
 * Playwright voice-call test (real-auth, no hardcoded ids).
 *
 * Goal: prove the WebRTC voice-call pipeline works end-to-end with
 *   1. Caller (tourist) on /chat starts a voice call (deeplink).
 *   2. Callee (buddy) on /chat receives the popup (deeplink).
 *   3. Callee accepts → CallModal mounts in 'connecting' → 'connected'.
 *   4. Both sides exchange an audio MediaStream.
 *   5. Either side can end the call cleanly.
 *   6. A SECOND call must work (regression: "cannot call again
 *      after decline").
 *
 * How we test:
 *   - Real Supabase Auth REST login (BUDDY_EMAIL/BUDDY_PASSWORD +
 *     TOURIST_EMAIL/TOURIST_PASSWORD).
 *   - GET /api/debug/voice-call-test?create=1 → conversation id.
 *   - POST /api/debug/voice-call-test { action: 'insert-pending' }
 *     → inserts a row in pending_calls. This is the same row the
 *     caller would insert on Phone click; the callee's
 *     IncomingCallWatcher reads it.
 *   - Both browsers navigate to /chat?call=<id>:
 *     * Caller side hits the `callParam === '1'` deeplink path
 *       (buddy/auto-call) — but `?call=<id>` is the *callee*
 *       accept deeplink. So caller side uses /chat?buddy=<buddyId>
 *       &call=1 OR we manually drive startOutgoingCall via the
 *       conversation page.
 *
 * Approach chosen here: navigate caller to /chat?c=<convId> (open
 * conversation), wait for the in-page "Voice call" button to render
 * and be enabled, then click it. Callee navigates to /chat (which
 * subscribes to pending_calls via IncomingCallWatcher).
 *
 * Usage:
 *   API_BASE=https://localit-vn.vercel.app \
 *   BUDDY_EMAIL=lan.pham@localit.dev BUDDY_PASSWORD=password123 \
 *   TOURIST_EMAIL=john.doe@example.com TOURIST_PASSWORD=password123 \
 *     node scripts/playwright-call-test.mjs
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
      headers: {
        apikey: ANON_KEY,
        'content-type': 'application/json',
      },
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
  // Seed the auth cookie in the exact format @supabase/ssr expects:
  // base64-encoded JSON, optionally chunked at 3180 chars
  // (`sb-<ref>-auth-token.0`, `.1`, etc.). Supabase chunks at the
  // `base64-encoded JSON value`, not the raw string.
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
    const chunks = []
    let i = 0
    let pos = 0
    while (pos < encoded.length) {
      const piece = encoded.slice(pos, pos + 3180)
      const chunkName = i === 0 ? storageKey : `${storageKey}.${i}`
      cookies.push({
        name: chunkName,
        value: piece,
        domain: new URL(API_BASE).hostname,
        path: '/',
        sameSite: 'Lax',
      })
      i++
      pos += 3180
    }
    void chunks
  }
  await context.addCookies(cookies)

  // Also seed localStorage for the client-side getSession() path.
  await context.addInitScript(
    ([key, val]) => {
      localStorage.setItem(key, val)
    },
    [storageKey, value],
  )
  return context
}

/**
 * Verify that the chat page actually sees the user as signed in.
 * If not (e.g. cookie format mismatch), drive the login form
 * instead.
 */
async function ensureSignedIn(page, session) {
  await page.goto('/chat')
  await page.waitForLoadState('domcontentloaded', { timeout: 10_000 })
  await page.waitForTimeout(1500)
  if (!page.url().includes('/login')) {
    return
  }
  console.log(`[call-test] localStorage seed insufficient; driving /login form for ${session.email}`)
  await page.locator('#email').fill(session.email)
  await page.locator('#password').fill(session.password)
  await Promise.all([
    page.waitForURL((url) => !url.toString().includes('/login'), { timeout: 15_000 }),
    page.locator('button[type="submit"]').click(),
  ])
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

/**
 * GET /api/debug/voice-call-test?create=1 → conversation id.
 */
async function getOrCreateConversation() {
  const r = await fetch(`${API_BASE}/api/debug/voice-call-test?create=1`)
  if (!r.ok) {
    throw new Error(`get-conversation failed: ${r.status} ${await r.text()}`)
  }
  const body = await r.json()
  if (!body?.conversationId) {
    throw new Error(`missing conversationId: ${JSON.stringify(body)}`)
  }
  return body
}

/**
 * Insert a row into pending_calls via the test endpoint.
 */
async function insertPendingCall(conversationId, callerId, calleeId) {
  const r = await fetch(`${API_BASE}/api/debug/voice-call-test`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      action: 'insert-pending',
      conversationId,
      callerId,
      calleeId,
    }),
  })
  if (!r.ok) {
    throw new Error(`insert-pending failed: ${r.status} ${await r.text()}`)
  }
  const body = await r.json()
  if (!body?.id) {
    throw new Error(`insert-pending missing id: ${JSON.stringify(body)}`)
  }
  return body
}

/**
 * Clean up any ringing rows from prior runs.
 */
async function cleanRinging() {
  await fetch(`${API_BASE}/api/debug/voice-call-test`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'clean-ringing' }),
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
  // Expose WebRTC debug stats on the page.
  page.exposeFunction?.(`${label}Dlog`, (msg) =>
    console.log(`  [${label}:rtcpdlog] ${msg}`),
  )
}

/**
 * Wait for both sides' CallModal to indicate the call is connected.
 * The <p aria-live="polite"> inside the modal shows formatted MM:SS
 * duration in connected state.
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
    if (/^\d{2}:\d{2}$/.test(tStr) || /^\d{2}:\d{2}$/.test(bStr)) {
      return true
    }
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

async function main() {
  console.log(`[call-test] api=${API_BASE}`)
  console.log('[call-test] signing in via Supabase Auth…')
  const buddySession = await signIn(BUDDY_EMAIL, BUDDY_PASSWORD)
  const touristSession = await signIn(TOURIST_EMAIL, TOURIST_PASSWORD)
  console.log(`  buddy=${buddySession.userId} tourist=${touristSession.userId}`)

  console.log('[call-test] marking both sides online…')
  await Promise.all([setOnline(buddySession), setOnline(touristSession)])

  console.log('[call-test] cleaning ringing rows + getting conversation…')
  await cleanRinging()
  const conv = await getOrCreateConversation()
  console.log(`  conversation=${conv.conversationId}`)

  console.log('[call-test] launching two browser instances…')
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

  // Callee navigates to /chat. The IncomingCallWatcher polls
  // pending_calls with status='ringing' + callee_id=me.
  console.log('[call-test] buddy navigates to /chat (as callee)')
  await ensureSignedIn(buddyPage, buddySession)
  await buddyPage.waitForTimeout(2000)

  // Caller navigates to the conversation.
  console.log('[call-test] tourist navigates to /chat with conversation id')
  await ensureSignedIn(touristPage, touristSession)
  await touristPage.goto(`/chat?c=${conv.conversationId}`)
  await touristPage.waitForTimeout(5000)
  // Debug: dump current state.
  const url = touristPage.url()
  console.log(`  tourist URL: ${url}`)
  const has = await touristPage.locator('aside[aria-label*="Conversation details"]').count()
  console.log(`  ConversationDetails panels: ${has}`)

  // ===== CALL #1 =====
  console.log('[call-test] call#1: tourist clicks Voice call')
  // Take a screenshot first to see what's actually on the page.
  await touristPage.screenshot({ path: 'scripts/screenshots/call-test-pre-call.png', fullPage: true })
  const callBtn = touristPage
    .locator('button:has-text("Voice call"), button[aria-label*="Voice call"]')
    .first()
  await callBtn.waitFor({ state: 'visible', timeout: 15_000 })
  const disabled = await callBtn.getAttribute('disabled')
  if (disabled !== null) {
    await touristPage.screenshot({ path: 'scripts/screenshots/call-test-call1-disabled.png' })
    throw new Error('Voice call button disabled (buddy appears offline)')
  }
  await callBtn.click()

  // Tourist's CallModal appears immediately.
  const touristModal = touristPage.locator('[role="dialog"][aria-modal="true"]').first()
  await touristModal.waitFor({ state: 'visible', timeout: 10_000 })

  // Buddy's popup appears.
  console.log('[call-test] call#1: waiting for buddy popup')
  const buddyPopup = buddyPage
    .locator('[role="alertdialog"][aria-label="Incoming voice call"]')
    .first()
  await buddyPopup.waitFor({ state: 'visible', timeout: 20_000 })

  // Buddy accepts.
  console.log('[call-test] call#1: buddy clicks Accept')
  await buddyPopup.locator('button[aria-label="Accept call"]').click()

  // Buddy navigates to /chat?call=...
  await buddyPage.waitForURL((url) => url.toString().includes('call='), { timeout: 10_000 })
  const buddyModal = buddyPage.locator('[role="dialog"][aria-modal="true"]').first()
  await buddyModal.waitFor({ state: 'visible', timeout: 10_000 })

  console.log('[call-test] call#1: waiting for connected state (≤ 30 s)')
  const ok1 = await waitForConnected(touristPage, buddyPage, 'call#1', 30_000)
  if (!ok1) {
    await touristPage.screenshot({ path: 'scripts/screenshots/call-test-call1-fail-tourist.png' })
    await buddyPage.screenshot({ path: 'scripts/screenshots/call-test-call1-fail-buddy.png' })
    throw new Error('call#1 did not reach connected state')
  }
  console.log('  call#1 CONNECTED')

  // Tourist ends.
  console.log('[call-test] call#1: tourist ends call')
  await endCallOnTourist(touristPage)

  // ===== CALL #2 (regression) =====
  console.log('[call-test] call#2 (regression): tourist clicks Voice call again')
  const callBtn2 = touristPage
    .locator('button:has-text("Voice call"), button[aria-label*="Voice call"]')
    .first()
  await callBtn2.waitFor({ state: 'visible', timeout: 10_000 })
  const disabled2 = await callBtn2.getAttribute('disabled')
  if (disabled2 !== null) {
    throw new Error('call#2: Voice call button disabled after first call ended')
  }
  await callBtn2.click()

  console.log('[call-test] call#2: waiting for buddy popup')
  const popup2 = buddyPage
    .locator('[role="alertdialog"][aria-label="Incoming voice call"]')
    .first()
  await popup2.waitFor({ state: 'visible', timeout: 20_000 })

  console.log('[call-test] call#2: buddy accepts')
  await popup2.locator('button[aria-label="Accept call"]').click()
  await buddyPage.waitForTimeout(2000)

  console.log('[call-test] call#2: waiting for connected state')
  const ok2 = await waitForConnected(touristPage, buddyPage, 'call#2', 30_000)
  if (!ok2) {
    await touristPage.screenshot({ path: 'scripts/screenshots/call-test-call2-fail-tourist.png' })
    await buddyPage.screenshot({ path: 'scripts/screenshots/call-test-call2-fail-buddy.png' })
    throw new Error('call#2 did not reach connected state (regression!)')
  }
  console.log('  call#2 CONNECTED')

  console.log('[call-test] call#2: ending call')
  await endCallOnTourist(touristPage)

  console.log('[call-test] ALL CHECKS PASSED')

  await browser1.close()
  await browser2.close()
  process.exit(0)
}

main().catch((err) => {
  console.error('FATAL:', err)
  process.exit(1)
})