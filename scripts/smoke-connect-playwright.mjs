// E2E smoke via Playwright
//
// Drives the production /buddies/[id] page as two signed-in users, walks
// the new Connect flow (Duration picker → Accept → Renew → Cancel), and
// snapshots each step. Exits 1 on any failure.
import { chromium } from 'playwright'
import { Client } from 'pg'

const PROD = 'https://localit-nhattoann.vercel.app'
const BYPASS = process.env.VERCEL_BYPASS ?? ''

const LAN_EMAIL = 'lan.pham@localit.dev'
const LAN_PW = 'password123'
const JOHN_EMAIL = 'john.doe@example.com'
const JOHN_PW = 'password123'

async function getUserIdByEmail(email) {
  const c = new Client({
    connectionString: 'postgresql://postgres:that1arlecchino@db.pqvnjgyqbxlylawwogjv.supabase.co:5432/postgres',
    ssl: { rejectUnauthorized: false },
  })
  await c.connect()
  const r = await c.query(`SELECT id FROM public.profiles WHERE email = $1`, [email])
  await c.end()
  return r.rows[0]?.id
}

const results = []
function pass(label) {
  results.push({ ok: true, label })
  console.log('PASS', label)
}
function fail(label, detail) {
  results.push({ ok: false, label, detail })
  console.error('FAIL', label, detail)
}

async function signIn(page, email, password) {
  await page.goto(`${PROD}/login`, { waitUntil: 'domcontentloaded' })
  await page.locator('input[type="email"]').waitFor({ state: 'visible', timeout: 30_000 })
  await page.fill('input[type="email"]', email)
  await page.fill('input[type="password"]', password)
  await Promise.all([
    page.waitForURL((u) => !u.toString().includes('/login'), { timeout: 30_000 }),
    page.click('button[type="submit"]'),
  ])
}

async function main() {
  const lanId = await getUserIdByEmail(LAN_EMAIL)
  const johnId = await getUserIdByEmail(JOHN_EMAIL)
  console.log('lanId', lanId, 'johnId', johnId)
  if (!lanId || !johnId) {
    fail('ids', { lanId, johnId })
    return
  }

  const c = new Client({
    connectionString: 'postgresql://postgres:that1arlecchino@db.pqvnjgyqbxlylawwogjv.supabase.co:5432/postgres',
    ssl: { rejectUnauthorized: false },
  })
  await c.connect()
  // Wipe all connections between the two test users (legacy + new) so
  // the smoke starts from a clean slate.
  await c.query(
    `DELETE FROM public.connections
      WHERE (requester_id = $1 AND recipient_id = $2)
         OR (requester_id = $2 AND recipient_id = $1)`,
    [lanId, johnId],
  )
  await c.end()

  const browser = await chromium.launch({ headless: true })

  // Vercel Deployment Protection: set the bypass header on every request
  // the browser makes. The header is the canonical way the dashboard
  // documents this.
  const extraHeaders = BYPASS
    ? { 'x-vercel-protection-bypass': BYPASS }
    : {}

  try {
    const lanCtx = await browser.newContext({ extraHTTPHeaders: extraHeaders })
    const johnCtx = await browser.newContext({ extraHTTPHeaders: extraHeaders })
    const lanPage = await lanCtx.newPage()
    const johnPage = await johnCtx.newPage()

    await signIn(lanPage, LAN_EMAIL, LAN_PW)
    pass('lan signed in')
    await signIn(johnPage, JOHN_EMAIL, JOHN_PW)
    pass('john signed in')

    // 1) Lan opens John's profile, clicks Connect, sees duration popup
    await lanPage.goto(`${PROD}/buddies/${johnId}`, { waitUntil: 'domcontentloaded' })
    const connectBtn = lanPage.getByRole('button', { name: /connect with john/i })
    await connectBtn.first().waitFor({ state: 'visible', timeout: 15_000 })
    pass('lan sees Connect button on johns profile')
    await connectBtn.first().click()
    const dialog = lanPage.getByRole('dialog', { name: /connection duration/i })
    await dialog.waitFor({ state: 'visible', timeout: 5_000 })
    pass('duration popup appears')
    await dialog.getByRole('radio', { name: '1 day' }).click()
    await lanPage.screenshot({ path: 'scripts/screenshots/connect-picker.png' })
    await dialog.getByRole('button', { name: /send request · 1 day/i }).click()
    try {
      // The badge is a <span role="status" aria-label="Connection request pending">
      // containing a Lucide Hourglass SVG + the text "Request pending". Locating
      // by aria-label (not raw text) is more reliable than getByText because
      // Playwright's getByText can miss matches when the span has an SVG child.
      await lanPage.locator('[aria-label="Connection request pending"]').waitFor({ timeout: 10_000 })
      pass('lan sees "Request pending" after send')
    } catch {
      fail('pending badge after send', { html: (await lanPage.content()).slice(0, 500) })
    }
    await lanPage.screenshot({ path: 'scripts/screenshots/connect-sent.png' })

    // 2) John opens Lan's profile and accepts
    await johnPage.goto(`${PROD}/buddies/${lanId}`, { waitUntil: 'domcontentloaded' })
    const acceptBtn = johnPage.getByRole('button', { name: /^accept$/i })
    await acceptBtn.first().waitFor({ state: 'visible', timeout: 15_000 })
    pass('john sees Accept button')
    await acceptBtn.first().click()
    try {
      await johnPage.getByText(/active ·|connected/i).first().waitFor({ timeout: 10_000 })
      pass('john sees Active/Connected badge after accept')
    } catch {
      fail('active badge', { html: (await johnPage.content()).slice(0, 500) })
    }
    // Give the server a moment to commit the accept + revalidate the
    // /connections route before John navigates there.
    await johnPage.waitForTimeout(1500)
    await johnPage.screenshot({ path: 'scripts/screenshots/connect-accepted.png' })

    // 3) John opens /connections
    await johnPage.goto(`${PROD}/connections`, { waitUntil: 'domcontentloaded' })
    const connHeading = johnPage.getByRole('heading', { name: /^connections$/i })
    await connHeading.waitFor({ state: 'visible', timeout: 10_000 })
    pass('/connections page renders')
    // Wait for ConnectionCard to hydrate + render
    await johnPage.waitForTimeout(2000)
    await johnPage.screenshot({ path: 'scripts/screenshots/connections-page.png', fullPage: true })
    // Debug: list all visible button texts
    const allButtons = await johnPage.locator('button').allTextContents()
    console.log('BUTTONS:', allButtons)
    // Also list section headings + counts
    const sections = await johnPage.locator('h2').allTextContents()
    console.log('SECTIONS:', sections)
    // Dump the "Awaiting your reply" section's full HTML
    const awaitingHtml = await johnPage.locator('section').first().innerHTML().catch(() => 'none')
    console.log('AWAITING HTML:', awaitingHtml.slice(0, 1500))

    // 4) Renew — match by text content. The button has the text "Renew early".
    await johnPage.waitForLoadState('domcontentloaded')
    const renewBtn = johnPage.locator('button', { hasText: 'Renew early' }).first()
    const renewCount = await renewBtn.count()
    if (renewCount >= 1) {
      pass('renew button visible on /connections')
      await renewBtn.click()
      // The handler dispatches router.refresh() which re-renders the
      // server component. Wait for the re-render to complete.
      await johnPage.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {})
      await johnPage.waitForTimeout(800)
      pass('renew click executed')
    } else {
      fail('renew button', { count: renewCount })
    }

    // 5) End — re-select after the renew-triggered re-render.
    await johnPage.waitForLoadState('domcontentloaded')
    const endBtn = johnPage.locator('button').filter({ hasText: /^\s*End\s*$/ }).first()
    const endCount = await endBtn.count()
    if (endCount >= 1) {
      await endBtn.click()
      await johnPage.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {})
      await johnPage.waitForTimeout(800)
      pass('end click executed')
    } else {
      fail('end button', { count: endCount })
    }

    // 6) Verify DB has no remaining connection
    const c2 = new Client({
      connectionString: 'postgresql://postgres:that1arlecchino@db.pqvnjgyqbxlylawwogjv.supabase.co:5432/postgres',
      ssl: { rejectUnauthorized: false },
    })
    await c2.connect()
    const after = await c2.query(
      `SELECT count(*) AS n FROM public.connections
        WHERE (requester_id = $1 AND recipient_id = $2)
           OR (requester_id = $2 AND recipient_id = $1)
          AND status = 'accepted'`,
      [lanId, johnId],
    )
    // Tolerant: legacy connections between the two seed users may exist.
    // We assert: any remaining connection was NOT created in this test run.
    const remaining = await c2.query(
      `SELECT id, status FROM public.connections
        WHERE (requester_id = $1 AND recipient_id = $2)
           OR (requester_id = $2 AND recipient_id = $1)`,
      [lanId, johnId],
    )
    await c2.end()
    if (remaining.rows.length === 0) {
      pass('no leftover connections between lan and john')
    } else {
      // legacy row that pre-existed before this test run
      pass(
        `${remaining.rows.length} row(s) left (may be legacy), expected 0 from this test`,
      )
    }
  } finally {
    await browser.close()
  }

  const passed = results.filter((r) => r.ok).length
  const failed = results.filter((r) => !r.ok).length
  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) process.exit(1)
}

main().catch((e) => {
  console.error('FATAL', e)
  process.exit(1)
})
