// Smoke test for the 2026-10-10 Focus Mode rewrite.
//
// Verifies the new /focus/[sessionId] page renders the redesigned
// UI: real Leaflet map (no SVG), mic + location toggles in the
// header, no back arrow, embedded chat input, End Focus button.
//
// Setup:
//   - John (tourist) and Lan (buddy) sign in on separate Playwright
//     contexts.
//   - John sends a focus request, Lan accepts.
//   - Both navigate to the focus page.
//   - We assert the structural chrome (header pills, map iframe,
//     chat input, end button) is present on both sides.
//
// Note: We don't drive the LiveKit handshake here — the goal is to
// verify the page chrome, not the audio path. A separate two-way
// LiveKit test (scripts/playwright-livekit-twoway.mjs) already
// covers the audio path.

import { chromium } from 'playwright'
import { Client } from 'pg'

const BASE = 'https://localit-nhattoann.vercel.app'
const BYPASS = 'w6XAcwiXyFf9Pea8I6zwVONXAhc8Xs9A'
const DB_URL = `postgresql://postgres:that1arlecchino@db.pqvnjgyqbxlylawwogjv.supabase.co:5432/postgres`

async function getAuthCookie(email, password) {
  const browser = await chromium.launch()
  const ctx = await browser.newContext({
    extraHTTPHeaders: { 'x-vercel-protection-bypass': BYPASS },
  })
  const page = await ctx.newPage()
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
  await page.fill('input#email', email)
  await page.fill('input#password', password)
  await Promise.all([
    page.waitForURL('**/dashboard', { timeout: 20000 }),
    page.click('button:has-text("Sign in")'),
  ])
  const cookies = await ctx.cookies()
  await browser.close()
  return cookies
}

async function postWithCookies(url, body, cookies) {
  const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join('; ')
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      cookie: cookieHeader,
      'x-vercel-protection-bypass': BYPASS,
    },
    body: JSON.stringify(body),
  })
  const text = await res.text()
  return {
    status: res.status,
    json: (() => {
      try {
        return JSON.parse(text)
      } catch {
        return { _raw: text }
      }
    })(),
  }
}

async function getIdByEmail(email) {
  const client = new Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } })
  await client.connect()
  const r = await client.query('SELECT id FROM public.profiles WHERE email = $1', [email])
  await client.end()
  return r.rows[0]?.id
}

async function cleanup(db) {
  await db.query(
    `DELETE FROM public.focus_requests
     WHERE requester_id IN (SELECT id FROM public.profiles WHERE email IN ('john.doe@example.com','lan.pham@localit.dev'))
        OR recipient_id IN (SELECT id FROM public.profiles WHERE email IN ('john.doe@example.com','lan.pham@localit.dev'))`,
  )
  await db.query(
    `DELETE FROM public.focus_sessions
     WHERE user_a_id IN (SELECT id FROM public.profiles WHERE email IN ('john.doe@example.com','lan.pham@localit.dev'))
        OR user_b_id IN (SELECT id FROM public.profiles WHERE email IN ('john.doe@example.com','lan.pham@localit.dev'))`,
  )
}

let failures = 0
function expect(label, ok, extra) {
  if (ok) {
    console.log(`PASS: ${label}${extra ? ' — ' + JSON.stringify(extra) : ''}`)
  } else {
    console.log(`FAIL: ${label}${extra ? ' — ' + JSON.stringify(extra) : ''}`)
    failures++
  }
}

const main = async () => {
  const db = new Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } })
  await db.connect()
  await cleanup(db)
  await db.end()

  // John and Lan sign in. Note: after the 2026-10-09 seed fix Lan
  // and John are both role='buddy', so cross-role focus requests
  // require a real tourist. We use Sarah (tourist) ↔ Lan (buddy).
  const [johnId, lanId, sarahId] = await Promise.all([
    getIdByEmail('john.doe@example.com'),
    getIdByEmail('lan.pham@localit.dev'),
    getIdByEmail('sarah.m@example.com'),
  ])
  if (!johnId || !lanId || !sarahId) throw new Error('seed users not found')
  const [sarahCookies, lanCookies] = await Promise.all([
    getAuthCookie('sarah.m@example.com', 'password123'),
    getAuthCookie('lan.pham@localit.dev', 'password123'),
  ])

  // Find or create a conversation between them.
  let convId = null
  const cdb = new Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } })
  await cdb.connect()
  const r = await cdb.query(
    `SELECT c.id FROM public.conversations c
     WHERE (c.tourist_id = $1 AND c.buddy_id = $2)
        OR (c.tourist_id = $2 AND c.buddy_id = $1)
     LIMIT 1`,
    [sarahId, lanId],
  )
  convId = r.rows[0]?.id ?? null
  if (!convId) {
    const ins = await cdb.query(
      `INSERT INTO public.conversations (tourist_id, buddy_id)
       VALUES ($1, $2)
       RETURNING id`,
      [sarahId, lanId],
    )
    convId = ins.rows[0]?.id
  }
  await cdb.end()

  // Sarah sends request, Lan accepts → creates a focus session.
  const req1 = await postWithCookies(
    `${BASE}/api/focus/request`,
    { recipient_id: lanId, conversation_id: convId },
    sarahCookies,
  )
  expect('focus request 201', req1.status === 201, { status: req1.status, body: req1.json })
  const requestId = req1.json.request?.id
  const accept = await postWithCookies(
    `${BASE}/api/focus/${requestId}/respond`,
    { action: 'accept' },
    lanCookies,
  )
  expect('accept returns 200 with session', accept.status === 200 && !!accept.json.session?.id, {
    status: accept.status,
    body: accept.json,
  })
  const sessionId = accept.json.session?.id

  // Both users navigate to /focus/[sessionId] in a Playwright browser.
  // Use a single browser instance with two contexts.
  const browser = await chromium.launch()
  async function openFocus(email, label) {
    const ctx = await browser.newContext({
      extraHTTPHeaders: { 'x-vercel-protection-bypass': BYPASS },
    })
    const page = await ctx.newPage()
    // Capture console logs so we can spot any React errors.
    const consoleErrors = []
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(`[${label}] ${msg.text()}`)
    })
    page.on('pageerror', (err) => consoleErrors.push(`[${label}] pageerror: ${err.message}`))
    // Log in then go to focus.
    await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
    await page.fill('input#email', email)
    await page.fill('input#password', 'password123')
    await Promise.all([
      page.waitForURL('**/dashboard', { timeout: 20000 }),
      page.click('button:has-text("Sign in")'),
    ])
    await page.goto(`${BASE}/focus/${sessionId}`, { waitUntil: 'domcontentloaded' })
    // Give the React tree time to mount and the map to start loading.
    await page.waitForTimeout(2500)
    return { ctx, page, consoleErrors }
  }

  const [sarah, lan] = await Promise.all([
    openFocus('sarah.m@example.com', 'sarah'),
    openFocus('lan.pham@localit.dev', 'lan'),
  ])

  // Take screenshots before checking DOM.
  await sarah.page.screenshot({
    path: 'scripts/screenshots/focus-rewrite-sarah.png',
    fullPage: false,
  })
  await lan.page.screenshot({
    path: 'scripts/screenshots/focus-rewrite-lan.png',
    fullPage: false,
  })

  // --- Structural checks (run on Sarah's page — Lan should be identical) ---

  // 1. No back arrow (ArrowLeft) in the header — the user explicitly
  //    said no escape except End or close browser.
  const backArrowVisible = await sarah.page
    .locator('header a[aria-label="Back to chat"]')
    .count()
  expect('no back arrow in header', backArrowVisible === 0, { count: backArrowVisible })

  // 2. Header has the partner's name.
  const headerHasPartner = await sarah.page
    .locator('header h1:has-text("Focus with")')
    .count()
  expect("header shows 'Focus with <partner>'", headerHasPartner > 0)

  // 3. Mic toggle button (always-on mic control) is present.
  const micButton = await sarah.page.locator('button[aria-label*="microphone"]').count()
  expect('mic toggle button in header', micButton > 0, { count: micButton })

  // 4. Location toggle button is present.
  const locButton = await sarah.page
    .locator('button[aria-label*="location sharing"]')
    .count()
  expect('location toggle button in header', locButton > 0, { count: locButton })

  // 5. End Focus button is present.
  const endButton = await sarah.page.locator('button:has-text("End Focus")').count()
  expect('End Focus button', endButton > 0, { count: endButton })

  // 6. Real Leaflet map is rendered (not the old SVG). Leaflet
  //    creates .leaflet-container inside the map section.
  const leafletContainer = await sarah.page.locator('.leaflet-container').count()
  expect('real Leaflet map rendered', leafletContainer > 0, { count: leafletContainer })

  // 7. The OLD SVG fallback is NOT rendered.
  const oldSvgMap = await sarah.page
    .locator('section[aria-label="Focus map"] svg')
    .count()
  expect('old SVG map is gone', oldSvgMap === 0, { count: oldSvgMap })

  // 8. Chat input is present (embedded chat with bubble UI).
  const chatInput = await sarah.page.locator('input[aria-label="Message draft"]').count()
  expect('embedded chat input present', chatInput > 0, { count: chatInput })

  // 9. Send button is present.
  const sendButton = await sarah.page.locator('button[aria-label="Send message"]').count()
  expect('chat send button present', sendButton > 0, { count: sendButton })

  // 10. No console errors on either side.
  expect('no console errors on sarah', sarah.consoleErrors.length === 0, {
    errors: sarah.consoleErrors,
  })
  expect('no console errors on lan', lan.consoleErrors.length === 0, {
    errors: lan.consoleErrors,
  })

  // --- Send a message from Sarah, verify it appears on Lan's side ---

  await sarah.page.fill('input[aria-label="Message draft"]', 'Xin chào from focus rewrite!')
  await sarah.page.click('button[aria-label="Send message"]')
  // Wait for postgres_changes to fan out.
  await lan.page.waitForTimeout(2500)
  const lanSawMessage = await lan.page
    .locator('text=Xin chào from focus rewrite!')
    .count()
  expect("Lan's side shows Sarah's bubble", lanSawMessage > 0, { count: lanSawMessage })

  // Take an after-send screenshot to capture the chat bubble.
  await sarah.page.screenshot({
    path: 'scripts/screenshots/focus-rewrite-sarah-after-send.png',
    fullPage: false,
  })
  await lan.page.screenshot({
    path: 'scripts/screenshots/focus-rewrite-lan-after-send.png',
    fullPage: false,
  })

  // End the session from Sarah's side.
  sarah.page.once('dialog', (d) => d.accept())
  await sarah.page.click('button:has-text("End Focus")')
  await sarah.page.waitForURL('**/chat', { timeout: 10000 }).catch(() => undefined)
  const sarahRouted = sarah.page.url().includes('/chat')
  expect('End Focus routes back to /chat', sarahRouted, { url: sarah.page.url() })

  // Cleanup.
  await browser.close()
  const db2 = new Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } })
  await db2.connect()
  await cleanup(db2)
  await db2.end()

  console.log(failures === 0 ? 'All checks passed.' : `FAILED: ${failures}`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error(e)
  process.exit(2)
})
