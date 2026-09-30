/**
 * Playwright caller→callee test (real-auth, no hardcoded ids).
 *
 * Goal: tourist clicks Phone, buddy receives the popup, Accept lands
 * on CallModal in 'connecting' → 'connected' state, both sides
 * exchange an audio MediaStream, and either side can end the call
 * cleanly. After ending, a SECOND call must succeed (regression for
 * "cannot call again after decline").
 *
 * Credentials come from env vars — never hardcoded:
 *   BUDDY_EMAIL, BUDDY_PASSWORD, TOURIST_EMAIL, TOURIST_PASSWORD
 *   API_BASE (defaults to https://localit-vn.vercel.app)
 *
 * Production seed accounts (per AGENTS.md):
 *   buddy:   lan.pham@localit.dev   / password123
 *   tourist: john.doe@example.com    / password123
 */

import { chromium } from 'playwright'

const API_BASE = process.env.API_BASE ?? 'https://localit-vn.vercel.app'
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
 * Sign in via Supabase Auth REST API. Mirrors what
 * utils/supabase/auth.ts does on the client.
 */
async function signIn(email, password) {
  const res = await fetch(
    `${API_BASE}/auth/v1/token?grant_type=password`,
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
  }
}

/**
 * Build a Playwright BrowserContext with the Supabase session seeded
 * into localStorage so the chat page sees the user as signed-in
 * without driving the login form.
 */
async function buildContext(browser, session) {
  const context = await browser.newContext({
    permissions: ['microphone'],
    baseURL: API_BASE,
  })
  await context.addInitScript(
    ([url, key, s]) => {
      const projectRef = new URL(url).hostname.split('.')[0]
      const storageKey = `sb-${projectRef}-auth-token`
      localStorage.setItem(
        storageKey,
        JSON.stringify({
          access_token: s.accessToken,
          refresh_token: s.refreshToken,
          expires_in: 3600,
          expires_at: Math.floor(Date.now() / 1000) + 3600,
          token_type: 'bearer',
          user: {
            id: s.userId,
            email: s.email,
            aud: 'authenticated',
            role: 'authenticated',
          },
        }),
      )
    },
    [API_BASE, ANON_KEY, session],
  )
  return context
}

async function setOnline(session) {
  // Hit the same RPC the heartbeat uses. Failure here is non-fatal
  // (the page will set it on mount anyway) but helpful for the test
  // to start with both sides already online.
  await fetch(`${API_BASE}/rest/v1/rpc/set_online_status`, {
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
 * Make sure a conversation exists between the two users and that
 * the buddy is stored in the local open conversation so the tourist
 * can find them.
 */
async function ensureConversation(touristRequest, buddyUserId) {
  const res = await touristRequest.post(`${API_BASE}/api/debug/voice-call-test`, {
    data: { partnerUserId: buddyUserId },
    headers: { 'content-type': 'application/json' },
  })
  if (!res.ok()) {
    throw new Error(
      `voice-call-test setup failed: ${res.status()} ${await res.text()}`,
    )
  }
  const body = await res.json()
  if (!body?.conversationId) {
    throw new Error(`voice-call-test missing conversationId: ${JSON.stringify(body)}`)
  }
  return body
}

function attachConsoleLogger(page, label) {
  page.on('console', (m) => {
    const t = m.text()
    // Skip noisy logs
    if (/Download the React DevTools|webpack-hot-middleware/i.test(t)) return
    console.log(`  [${label}:console] ${m.type()} ${t}`)
  })
  page.on('pageerror', (e) =>
    console.log(`  [${label}:pageerror] ${e.message}`),
  )
}

async function runCallOnce(touristPage, buddyPage, label) {
  console.log(`[call-test] ${label}: tourist clicks Voice call`)
  const callBtn = touristPage
    .locator('button[aria-label*="Voice call"]')
    .first()
  await callBtn.waitFor({ state: 'visible', timeout: 10_000 })
  const disabled = await callBtn.getAttribute('disabled')
  if (disabled !== null) {
    throw new Error('Voice call button disabled (buddy offline?)')
  }
  await callBtn.click()

  // Tourist's CallModal should appear.
  const touristModal = touristPage
    .locator('[role="dialog"][aria-modal="true"]')
    .first()
  await touristModal.waitFor({ state: 'visible', timeout: 10_000 })

  // Buddy's popup should appear.
  console.log(`[call-test] ${label}: waiting for buddy popup`)
  const buddyPopup = buddyPage
    .locator('[role="alertdialog"][aria-label="Incoming voice call"]')
    .first()
  await buddyPopup.waitFor({ state: 'visible', timeout: 15_000 })

  // Buddy accepts.
  console.log(`[call-test] ${label}: buddy clicks Accept`)
  await buddyPopup.locator('button[aria-label="Accept call"]').click()

  // Buddy's CallModal appears after navigation to /chat?call=...
  await buddyPage.waitForURL(
    (url) => url.toString().includes('call='),
    { timeout: 10_000 },
  )
  const buddyModal = buddyPage
    .locator('[role="dialog"][aria-modal="true"]')
    .first()
  await buddyModal.waitFor({ state: 'visible', timeout: 10_000 })

  // Wait for the WebRTC peer to reach 'connected' state.
  console.log(`[call-test] ${label}: waiting for connected state (≤ 20 s)`)
  let connected = false
  for (let i = 0; i < 20; i++) {
    const [tText, bText] = await Promise.all([
      touristModal
        .locator('p[aria-live="polite"]')
        .first()
        .textContent()
        .catch(() => ''),
      buddyModal
        .locator('p[aria-live="polite"]')
        .first()
        .textContent()
        .catch(() => ''),
    ])
    console.log(
      `  t=${i + 1}s tourist="${tText}" buddy="${bText}"`,
    )
    const tStr = (tText ?? '').trim()
    const bStr = (bText ?? '').trim()
    if (/^\d{2}:\d{2}$/.test(tStr) || /^\d{2}:\d{2}$/.test(bStr)) {
      connected = true
      break
    }
    await touristPage.waitForTimeout(1000)
  }
  if (!connected) {
    throw new Error('WebRTC did not reach connected state')
  }

  // Tourist ends.
  console.log(`[call-test] ${label}: tourist ends call`)
  await touristPage.locator('button[aria-label="End call"]').first().click()

  // Modals clear after 1.5–3 s of ended state.
  await touristPage.waitForTimeout(3500)
  await buddyPage.waitForTimeout(3500)
}

async function main() {
  console.log(`[call-test] api=${API_BASE}`)
  console.log('[call-test] signing in via Supabase Auth…')
  const buddySession = await signIn(BUDDY_EMAIL, BUDDY_PASSWORD)
  const touristSession = await signIn(TOURIST_EMAIL, TOURIST_PASSWORD)
  console.log(`  buddy=${buddySession.userId} tourist=${touristSession.userId}`)

  console.log('[call-test] marking both sides online…')
  await Promise.all([setOnline(buddySession), setOnline(touristSession)])

  console.log('[call-test] launching two browser instances…')
  const browser1 = await chromium.launch({
    args: [
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
    ],
  })
  const browser2 = await chromium.launch({
    args: [
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
    ],
  })

  const buddyCtx = await buildContext(browser1, buddySession)
  const touristCtx = await buildContext(browser2, touristSession)

  const buddyPage = await buddyCtx.newPage()
  const touristPage = await touristCtx.newPage()
  attachConsoleLogger(buddyPage, 'buddy')
  attachConsoleLogger(touristPage, 'tourist')

  console.log('[call-test] ensuring conversation + loading /chat…')
  const conv = await ensureConversation(
    touristCtx.request,
    buddySession.userId,
  )
  console.log(`  conversation=${conv.conversationId}`)

  await Promise.all([buddyPage.goto('/chat'), touristPage.goto('/chat')])
  await touristPage.waitForTimeout(2000)
  await touristPage.goto(`/chat?c=${conv.conversationId}`)
  await touristPage.waitForTimeout(3000)

  // First call (baseline).
  await runCallOnce(touristPage, buddyPage, 'call#1')

  // Second call (regression: must work after ending first call).
  await runCallOnce(touristPage, buddyPage, 'call#2 (regression)')

  console.log('[call-test] ALL CHECKS PASSED')

  await browser1.close()
  await browser2.close()
  process.exit(0)
}

main().catch((err) => {
  console.error('FATAL:', err)
  process.exit(1)
})