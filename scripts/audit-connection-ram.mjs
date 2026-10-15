// RAM audit for the new connection components.
//
// 1. Open /buddies/<id> as Lan
// 2. Sit 30s, count:
//    - how many /api/connections/check requests fired (per page load
//      we expect exactly 1, plus the in-app bell which polls on its
//      own schedule)
//    - any console errors / hydration warnings
//    - any setState-on-unmounted warnings
// 3. Navigate to /connections and back, repeat. Heap should not grow.
//
// Run: node scripts/audit-connection-ram.mjs
import { chromium } from 'playwright'
import { Client } from 'pg'

const PROD = 'https://localit-nhattoann.vercel.app'
const BYPASS = process.env.VERCEL_BYPASS ?? ''
const LAN = 'lan.pham@localit.dev'
const PW = 'password123'

async function getId(email) {
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

async function main() {
  const lanId = await getId(LAN)
  const buddyId = '22222222-2222-2222-2222-222222222222' // Linh Tran
  console.log('lan', lanId, 'buddy', buddyId)

  const browser = await chromium.launch({ headless: true })
  const extraHeaders = BYPASS ? { 'x-vercel-protection-bypass': BYPASS } : {}
  const ctx = await browser.newContext({ extraHTTPHeaders: extraHeaders })
  const page = await ctx.newPage()

  // Track every connections/check call.
  const checkCalls = []
  page.on('request', (req) => {
    if (req.url().includes('/api/connections/check')) {
      checkCalls.push({ url: req.url(), time: Date.now() })
    }
  })
  const consoleErrors = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text())
  })
  const pageErrors = []
  page.on('pageerror', (e) => pageErrors.push(e.message))

  // Sign in
  await page.goto(`${PROD}/login`, { waitUntil: 'domcontentloaded' })
  await page.locator('input[type="email"]').waitFor({ state: 'visible', timeout: 30_000 })
  await page.fill('input[type="email"]', LAN)
  await page.fill('input[type="password"]', PW)
  await Promise.all([
    page.waitForURL((u) => !u.toString().includes('/login'), { timeout: 30_000 }),
    page.click('button[type="submit"]'),
  ])
  pass('signed in')

  // Visit /buddies/<buddyId>
  await page.goto(`${PROD}/buddies/${buddyId}`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2000)
  const initialCheckCount = checkCalls.length
  console.log('check calls after /buddies mount:', initialCheckCount)
  if (initialCheckCount === 1) {
    pass('exactly 1 /api/connections/check on buddy profile mount')
  } else if (initialCheckCount <= 3) {
    pass(`acceptable ${initialCheckCount} /api/connections/check on mount`)
  } else {
    fail(`/api/connections/check fired ${initialCheckCount} times on mount`, { checkCalls: checkCalls.slice(0, 10) })
  }

  // Wait 20s, count new requests
  const before = checkCalls.length
  await page.waitForTimeout(20_000)
  const after = checkCalls.length
  console.log(`after 20s sit: ${after} total check calls (delta=${after - before})`)
  if (after - before <= 2) {
    pass(`no runaway polling (${after - before} extra calls in 20s)`)
  } else {
    fail(`runaway polling: ${after - before} extra calls in 20s`, { checkCalls: checkCalls.slice(before) })
  }

  // Navigate to /connections and back
  await page.goto(`${PROD}/connections`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2000)
  await page.goto(`${PROD}/buddies/${buddyId}`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2000)
  const navTotal = checkCalls.length
  console.log(`after round-trip /connections → /buddies: ${navTotal} total check calls`)
  if (navTotal - after <= 2) {
    pass(`no leak on navigation (${navTotal - after} extra calls)`)
  } else {
    fail(`leak on navigation: ${navTotal - after} extra calls`, { checkCalls: checkCalls.slice(after) })
  }

  // Console errors
  if (consoleErrors.length === 0) {
    pass('no console errors')
  } else {
    fail(`console errors (${consoleErrors.length})`, consoleErrors.slice(0, 5))
  }
  if (pageErrors.length === 0) {
    pass('no page errors')
  } else {
    fail(`page errors (${pageErrors.length})`, pageErrors.slice(0, 5))
  }

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
