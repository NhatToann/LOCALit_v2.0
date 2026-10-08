#!/usr/bin/env node
// Smoke test: real DB persistence of "Save buddy" on /browse.
//
// Asserts:
//   1. Logged-in tourist opens /browse — sees the seed buddies.
//   2. Saves 2 buddies (clicks the Save button on two expanded rows).
//   3. /api/swipe/saved-ids returns both IDs.
//   4. Reloads /browse — both hearts are still filled.
//   5. Unsave one — /api/swipe/saved-ids drops to 1 ID.
//   6. Default "All" sort is now location-first, not insertion order.
//
// Uses the seed tourist account (john.doe@example.com). Clears any
// pre-existing swipes for that user before the test so the count is
// deterministic.

import { chromium } from 'playwright'
import { Client } from 'pg'

const BASE = 'https://localit-nhattoann.vercel.app'
const BYPASS = 'w6XAcwiXyFf9Pea8I6zwVONXAhc8Xs9A'
const SEED_EMAIL = 'john.doe@example.com'
const SEED_PW = 'password123'
const DB_PW = process.env.DB_PW || 'that1arlecchino'
const DB_HOST = 'db.pqvnjgyqbxlylawwogjv.supabase.co'

const FAILS = []
function assert(label, ok, extra) {
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${label}${extra ? ' — ' + extra : ''}`)
  if (!ok) FAILS.push(label)
}

const pg = new Client({
  host: DB_HOST,
  port: 5432,
  user: 'postgres',
  password: DB_PW,
  database: 'postgres',
  ssl: { rejectUnauthorized: false },
})
await pg.connect()

// 1. Resolve the tourist's auth.users id
const { rows: userRows } = await pg.query(
  `SELECT id FROM auth.users WHERE email = $1 LIMIT 1`,
  [SEED_EMAIL],
)
if (userRows.length === 0) {
  console.error(`FATAL: seed user ${SEED_EMAIL} not found`)
  process.exit(2)
}
const userId = userRows[0].id

// 2. Pick 2 buddy IDs that exist in public.buddies (Da Nang)
const { rows: buddyRows } = await pg.query(
  `SELECT id, full_name FROM public.buddies b
   JOIN public.profiles p ON p.id = b.id
   WHERE b.location_city = 'Da Nang'
     AND b.latitude IS NOT NULL AND b.longitude IS NOT NULL
   ORDER BY p.full_name ASC LIMIT 4`,
)
if (buddyRows.length < 2) {
  console.error(`FATAL: need ≥2 buddies, found ${buddyRows.length}`)
  process.exit(2)
}
const [buddyA, buddyB, buddyC, buddyD] = buddyRows

// 3. Clear any pre-existing swipes for this tourist so the test is deterministic
await pg.query(
  `DELETE FROM public.swipes WHERE swiper_role='tourist' AND swiper_id=$1`,
  [userId],
)
console.log(`Cleared swipes for ${SEED_EMAIL}. Will save: ${buddyA.full_name} (${buddyA.id}), ${buddyB.full_name} (${buddyB.id})`)

const browser = await chromium.launch({ headless: true })
try {
  const ctx = await browser.newContext({
    extraHTTPHeaders: { 'x-vercel-protection-bypass': BYPASS },
    viewport: { width: 1280, height: 900 },
  })
  const page = await ctx.newPage()

  // Login
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
  await page.fill('input#email', SEED_EMAIL)
  await page.fill('input#password', SEED_PW)
  await Promise.all([
    page.waitForURL('**/dashboard', { timeout: 15000 }),
    page.click('button:has-text("Sign in")'),
  ])

  // Open /browse
  await page.goto(`${BASE}/browse`, { waitUntil: 'networkidle', timeout: 30000 })
  await page.waitForSelector('li button[aria-expanded]', { timeout: 15000 })

  // Sanity: the DB API starts empty
  const r0 = await page.evaluate(async () => {
    const r = await fetch('/api/swipe/saved-ids', { cache: 'no-store' })
    return await r.json()
  })
  assert('saved-ids starts empty', Array.isArray(r0.saved_ids) && r0.saved_ids.length === 0, JSON.stringify(r0))

  // Save the first two buddies via the in-page Save button.
  // Each list row has a button with the heart icon; aria-pressed flips.
  const saveButtons = page.locator('li button[aria-pressed]')
  const count = await saveButtons.count()
  assert('browse has at least 2 save buttons', count >= 2, `count=${count}`)

  await saveButtons.nth(0).click()
  await saveButtons.nth(1).click()
  // Wait for the two POST /api/swipe calls to settle
  await page.waitForTimeout(1500)

  const r1 = await page.evaluate(async () => {
    const r = await fetch('/api/swipe/saved-ids', { cache: 'no-store' })
    return await r.json()
  })
  assert('saved-ids now has 2 entries', r1.saved_ids?.length === 2, JSON.stringify(r1.saved_ids))

  // Reload — verify hearts survive the round-trip
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForSelector('li button[aria-pressed]', { timeout: 15000 })
  const pressedCount = await page.locator('li button[aria-pressed="true"]').count()
  assert('after reload, 2 hearts still filled', pressedCount === 2, `pressed=${pressedCount}`)

  // Unsave the first one
  const firstPressed = page.locator('li button[aria-pressed="true"]').first()
  await firstPressed.click()
  await page.waitForTimeout(1200)
  const r2 = await page.evaluate(async () => {
    const r = await fetch('/api/swipe/saved-ids', { cache: 'no-store' })
    return await r.json()
  })
  assert('after unsave, saved-ids drops to 1', r2.saved_ids?.length === 1, JSON.stringify(r2.saved_ids))

  // Default "All" sort check: first row's distance should be the
  // minimum (or close to it) across the visible buddies.
  const sortInfo = await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('li button[aria-expanded]'))
    const dists = rows
      .map((r) => r.textContent?.match(/([\d.]+)\s*km\s*away/)?.[1])
      .filter((x) => x != null)
      .map((x) => parseFloat(x))
    return { firstKm: dists[0] ?? null, minKm: dists.length ? Math.min(...dists) : null }
  })
  assert(
    'default sort is location-first (first row distance == min)',
    sortInfo.firstKm !== null && sortInfo.minKm !== null && Math.abs(sortInfo.firstKm - sortInfo.minKm) < 0.5,
    JSON.stringify(sortInfo),
  )

  await page.screenshot({ path: 'scripts/screenshots/save-buddies-final.png' })
} finally {
  // Cleanup: remove any swipes this test created
  await pg.query(
    `DELETE FROM public.swipes WHERE swiper_role='tourist' AND swiper_id=$1`,
    [userId],
  )
  await browser.close()
  await pg.end()
}

if (FAILS.length) {
  console.error(`\nFAIL: ${FAILS.length} check(s) failed: ${FAILS.join('; ')}`)
  process.exit(1)
}
console.log('\nAll checks passed.')
