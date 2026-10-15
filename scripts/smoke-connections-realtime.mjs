// scripts/smoke-connections-realtime.mjs
//
// Two-user Playwright test for the connections realtime subscription.
//
// What it verifies:
//   1. John (tourist) sends a connection request to Lan (buddy).
//   2. John's UI shows "Request pending" in "Sent requests".
//   3. John opens Lan's profile in tab A; sees "Connect with Lan" disabled
//      OR "Request pending" badge.
//   4. Lan (buddy) opens John's profile in tab B, clicks Accept.
//   5. WITHOUT reload, John's tab A sees the connection status flip
//      to "active" within <5s (realtime subscription).
//   6. John's /connections page (in tab C) also auto-updates to show
//      the connection in "Active" instead of "Sent requests".
//
// All three tabs are open BEFORE the accept click, so we test the
// subscription actually fires cross-user, not just a local state
// mutation.

import { chromium } from 'playwright'
import { Client } from 'pg'

const PROD = 'https://localit-nhattoann.vercel.app'
// Bypass is hardcoded because PowerShell `$env:X='value'` doesn't reliably
// pass through to a `&&`-chained command in this dev environment. The
// token is the same one documented in AGENTS.md and used by every other
// Playwright script in the repo.
const BYPASS = process.env.VERCEL_BYPASS || 'w6XAcwiXyFf9Pea8I6zwVONXAhc8Xs9A'

const LAN = { email: 'lan.pham@localit.dev', password: 'password123' }
const JOHN = { email: 'john.doe@example.com', password: 'password123' }

async function getId(email) {
  const c = new Client({
    connectionString: 'postgresql://postgres:that1arlecchino@db.pqvnjgyqbxlylawwogjv.supabase.co:5432/postgres',
    ssl: { rejectUnauthorized: false },
  })
  await c.connect()
  const r = await c.query('SELECT id FROM public.profiles WHERE email = $1', [email])
  await c.end()
  return r.rows[0]?.id
}

const results = []
function pass(label, detail) {
  results.push({ ok: true, label, detail })
  console.log('PASS', label, detail ?? '')
}
function fail(label, detail) {
  results.push({ ok: false, label, detail })
  console.error('FAIL', label, JSON.stringify(detail))
}

async function signIn(page, email, password) {
  // Vercel bypass: append the token as a query param on the FIRST
  // navigation so the initial 302 → vercel.com/sso-api still gets
  // served. Subsequent same-origin navigations ride on the bypass
  // cookie the server sets on the redirected response.
  const loginUrl = `${PROD}/login?x-vercel-protection-bypass=${BYPASS}`
  await page.goto(loginUrl, { waitUntil: 'domcontentloaded' })
  await page.locator('#email').waitFor({ state: 'visible', timeout: 30_000 })
  await page.fill('#email', email)
  await page.fill('#password', password)
  await Promise.all([
    page.waitForURL((u) => !u.toString().includes('/login'), { timeout: 30_000 }),
    page.click('button[type="submit"]'),
  ])
}

async function main() {
  const lanId = await getId(LAN.email)
  const johnId = await getId(JOHN.email)
  console.log('lanId', lanId, 'johnId', johnId)
  if (!lanId || !johnId) {
    fail('ids', { lanId, johnId })
    return
  }

  // Clean slate
  const c = new Client({
    connectionString: 'postgresql://postgres:that1arlecchino@db.pqvnjgyqbxlylawwogjv.supabase.co:5432/postgres',
    ssl: { rejectUnauthorized: false },
  })
  await c.connect()
  await c.query(
    `DELETE FROM public.connections
      WHERE (requester_id = $1 AND recipient_id = $2)
         OR (requester_id = $2 AND recipient_id = $1)`,
    [lanId, johnId],
  )

  const browser = await chromium.launch({ headless: true })
  const extraHeaders = BYPASS ? { 'x-vercel-protection-bypass': BYPASS } : {}
  const lanCtx = await browser.newContext({ extraHTTPHeaders: extraHeaders })
  const johnCtx = await browser.newContext({ extraHTTPHeaders: extraHeaders })
  const johnTabA = await johnCtx.newPage() // /buddies/[lanId]   — the page in the bug
  const johnTabC = await johnCtx.newPage() // /connections
  const lanTabB = await lanCtx.newPage() // /buddies/[johnId]   — will click Accept

  await signIn(johnTabA, JOHN.email, JOHN.password)
  await signIn(lanTabB, LAN.email, LAN.password)
  pass('john and lan signed in')

  // John sends a request to Lan via TabA
  await johnTabA.goto(`${PROD}/buddies/${lanId}`, { waitUntil: 'domcontentloaded' })
  const connectBtn = johnTabA.getByRole('button', { name: /connect with lan/i }).first()
  await connectBtn.waitFor({ state: 'visible', timeout: 15_000 })
  pass('john sees Connect button on lan profile')
  await connectBtn.click()
  const dialog = johnTabA.getByRole('dialog', { name: /connection duration/i })
  await dialog.waitFor({ state: 'visible', timeout: 5_000 })
  await dialog.getByRole('radio', { name: '1 day' }).click()
  await dialog.getByRole('button', { name: /send request · 1 day/i }).click()
  await johnTabA
    .locator('[aria-label="Connection request pending"]')
    .waitFor({ timeout: 10_000 })
  pass('john sees Request pending badge on lan profile')

  // John's /connections should now show the request in "Sent requests"
  await johnTabC.goto(`${PROD}/connections`, { waitUntil: 'domcontentloaded' })
  await johnTabC.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {})
  await johnTabC.waitForTimeout(800)
  const sentBeforeText = await johnTabC
    .locator('section')
    .filter({ hasText: 'Sent requests' })
    .innerText()
    .catch(() => '')
  if (/Lan/i.test(sentBeforeText)) {
    pass('john sees Lan in Sent requests', { text: sentBeforeText.slice(0, 80) })
  } else {
    fail('john Sent requests', { text: sentBeforeText.slice(0, 200) })
  }

  // Now Lan opens John's profile and accepts
  await lanTabB.goto(`${PROD}/buddies/${johnId}`, { waitUntil: 'domcontentloaded' })
  const acceptBtn = lanTabB.getByRole('button', { name: /^accept$/i }).first()
  await acceptBtn.waitFor({ state: 'visible', timeout: 15_000 })
  pass('lan sees Accept button on john profile')

  // Time the realtime propagation.
  const acceptStart = Date.now()
  await acceptBtn.click()

  // The realtime listener is supposed to fire router.refresh() / refetch
  // on John's tabA. We assert: within 5s, the "Request pending" badge
  // disappears OR the page shows an "active" / "connected" status.
  const propagationDeadline = acceptStart + 5000
  let johnA_updated = false
  while (Date.now() < propagationDeadline) {
    const txt = await johnTabA.locator('body').innerText()
    // After accept, the badge should switch to either:
    //   - "active" (per the ConnectionStatusBadge string)
    //   - "Active"
    //   - "Message" button visible (the connect button is replaced)
    if (
      /\bactive\b/i.test(txt) ||
      txt.includes('Renew early') ||
      txt.includes('Your connection')
    ) {
      johnA_updated = true
      break
    }
    await johnTabA.waitForTimeout(250)
  }
  if (johnA_updated) {
    pass('john TabA realtime-updated after lan accept', { ms: Date.now() - acceptStart })
  } else {
    const html = (await johnTabA.content()).slice(0, 500)
    fail('john TabA realtime update', { ms: Date.now() - acceptStart, html })
  }

  // Now check /connections on TabC
  let johnC_updated = false
  const cDeadline = Date.now() + 5000
  while (Date.now() < cDeadline) {
    await johnTabC.waitForTimeout(250)
    const txt = await johnTabC
      .locator('section')
      .filter({ hasText: 'Active' })
      .innerText()
      .catch(() => '')
    if (/Lan/i.test(txt)) {
      johnC_updated = true
      break
    }
  }
  if (johnC_updated) {
    pass('john /connections realtime-updated (Lan moved to Active)', {
      ms: Date.now() - acceptStart,
    })
  } else {
    const sections = await johnTabC.locator('section').allInnerTexts()
    fail('john /connections realtime update', { sections })
  }

  // Cleanup
  const c2 = new Client({
    connectionString: 'postgresql://postgres:that1arlecchino@db.pqvnjgyqbxlylawwogjv.supabase.co:5432/postgres',
    ssl: { rejectUnauthorized: false },
  })
  await c2.connect()
  await c2.query(
    `DELETE FROM public.connections
      WHERE (requester_id = $1 AND recipient_id = $2)
         OR (requester_id = $2 AND recipient_id = $1)`,
    [lanId, johnId],
  )
  await c2.end()
  await browser.close()

  const passed = results.filter((r) => r.ok).length
  const failed = results.filter((r) => !r.ok).length
  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) process.exit(1)
}

main().catch((e) => {
  console.error('FATAL', e)
  process.exit(1)
})
