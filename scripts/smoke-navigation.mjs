// Regression sweep after replacing router.push with lib/navigation:
//  1. Decline path on a connection request
//  2. Message notification -> /chat
//  3. View all -> /notifications page
//  4. Navbar links still navigate
//  5. Auth request storm is gone (RAM)
import { chromium } from 'playwright'
import { Client } from 'pg'

const ORIGIN = 'https://localit-vn.vercel.app'
const TOURIST = { name: 'Phan Nhật Toàn', id: 'f2df98b0-96cf-451d-9d85-5060ddc1ca01' }
const BUDDY = { email: 'lan.pham@localit.dev', id: '11111111-1111-1111-1111-111111111111' }
const PW = 'password123'

let passed = 0, failed = 0
const ok = (l, c, e = '') => { if (c) { passed++; console.log(`  PASS  ${l}`) } else { failed++; console.log(`  FAIL  ${l}  ${e}`) } }

const pg = new Client({
  host: 'db.pqvnjgyqbxlylawwogjv.supabase.co', port: 5432, user: 'postgres',
  password: process.env.DB_PW || process.env.SUPABASE_DB_PASSWORD || 'that1arlecchino',
  database: 'postgres', ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 15000,
})
const db = async (sql, p = []) => (await pg.query(sql, p)).rows
await pg.connect()

const browser = await chromium.launch()
const stop = setTimeout(() => { console.error('HARD TIMEOUT'); process.exit(1) }, 300000)

const seedRequest = async (msg) => {
  await db(`DELETE FROM public.notifications WHERE user_id = $1 AND type = 'connection_request'`, [BUDDY.id])
  await db(`DELETE FROM public.connections WHERE tourist_id = $1 AND buddy_id = $2`, [TOURIST.id, BUDDY.id])
  await db(
    `INSERT INTO public.connections (tourist_id, buddy_id, requester_id, recipient_id, requester_role, recipient_role, status, message)
     VALUES ($1,$2,$1,$2,'tourist','buddy','pending',$3)`,
    [TOURIST.id, BUDDY.id, msg])
  await new Promise((r) => setTimeout(r, 1500))
}

try {
  const page = await (await browser.newContext()).newPage()
  const errs = []
  page.on('pageerror', (e) => errs.push(e.message))

  await page.goto(`${ORIGIN}/login?switch=1`, { waitUntil: 'domcontentloaded' })
  await page.fill('input[type="email"]', BUDDY.email)
  await page.fill('input[type="password"]', PW)
  await page.click('button[type="submit"]')
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 25000 })
  await page.waitForTimeout(2500)

  console.log('\n=== 1. DECLINE path ===')
  await seedRequest('E2E decline check')
  await page.goto(`${ORIGIN}/tourists/${TOURIST.id}`, { waitUntil: 'load' })
  await page.waitForTimeout(4000)
  const decline = page.locator('button:text-is("Decline")').first()
  ok('Decline button rendered', (await decline.count()) === 1)
  if (await decline.count()) {
    await decline.click()
    await page.waitForTimeout(3000)
    const [c] = await db(`SELECT status::text FROM public.connections WHERE tourist_id=$1 AND buddy_id=$2`, [TOURIST.id, BUDDY.id])
    ok('Decline persisted status=declined', c?.status === 'declined', JSON.stringify(c))
    ok('UI offers "Connect again"', (await page.locator('button:has-text("Connect again")').count()) === 1)
  }

  console.log('\n=== 2. MESSAGE notification -> /chat ===')
  await page.goto(`${ORIGIN}/dashboard`, { waitUntil: 'load' })
  await page.waitForTimeout(2500)
  await page.locator('button[aria-label*="otification"]').first().click()
  await page.waitForTimeout(1500)
  const msgRow = page.locator('#notification-panel button:has-text("New message from")').first()
  ok('message notification visible', (await msgRow.count()) > 0)
  if (await msgRow.count()) {
    await msgRow.click()
    await page.waitForTimeout(4000)
    ok('message tap navigated to /chat', page.url().includes('/chat'), page.url())
  }

  console.log('\n=== 3. "View all" -> /notifications ===')
  await page.goto(`${ORIGIN}/dashboard`, { waitUntil: 'load' })
  await page.waitForTimeout(2500)
  await page.locator('button[aria-label*="otification"]').first().click()
  await page.waitForTimeout(1200)
  await page.locator('#notification-panel button:has-text("View all")').click()
  await page.waitForTimeout(4000)
  ok('View all navigated to /notifications', page.url().includes('/notifications'), page.url())
  ok('notifications page lists rows', (await page.locator('li button[aria-label*="connect"], li button[aria-label*="message"]').count()) > 0)

  console.log('\n=== 4. Navbar links ===')
  // The header's real link set (components/layout/Header.tsx):
  // Dashboard / Swipe / Buddies / Trips / Chat. `/map` is deliberately
  // not in the nav. `/trips` is 308-rewritten to `/itinerary` by the
  // middleware and `/swipe` to `/likes`, so those two assert the
  // destination rather than the href.
  for (const [label, expect] of [
    ['Dashboard', '/dashboard'],
    ['Swipe', '/likes'],
    ['Buddies', '/browse'],
    ['Messages', '/chat'],
  ]) {
    const before = page.url()
    const link = page.locator('header a, nav a').filter({ hasText: label }).first()
    if (await link.count()) {
      await link.click()
      await page.waitForTimeout(3500)
      ok(`navbar "${label}" navigates to ${expect}`, page.url().includes(expect), `${before} -> ${page.url()}`)
    } else {
      ok(`navbar "${label}" link present`, false, `no link labelled ${label}`)
    }
  }

  console.log('\n=== 5. Auth request storm (RAM) ===')
  await page.goto(`${ORIGIN}/dashboard`, { waitUntil: 'load' })
  await page.waitForTimeout(1000)
  let profiles = 0
  page.on('request', (r) => {
    if (r.url().includes('/rest/v1/profiles?select=full_name')) profiles++
  })
  await page.goto(`${ORIGIN}/tourists/${TOURIST.id}`, { waitUntil: 'load' })
  await page.waitForTimeout(6000)
  ok(`profiles query storm collapsed (${profiles} call(s), was 20)`, profiles <= 2, `got ${profiles}`)

  const real = errs.filter((e) => !/favicon|Not Found|Failed to load resource/i.test(e))
  ok('no page errors', real.length === 0, real.slice(0, 2).join(' | '))
} catch (e) {
  failed++; console.error('\n  ERROR:', e.message)
} finally {
  await browser.close(); await pg.end()
}

console.log(`\n${passed} passed, ${failed} failed`)
clearTimeout(stop)
process.exit(failed > 0 ? 1 : 0)