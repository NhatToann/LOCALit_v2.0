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
// Sarah.m is a confirmed-tourist seed (role='tourist' on public.profiles).
// John Doe is a buddy in the seed (despite the email), so do NOT use him.
const SEED_EMAIL = 'sarah.m@example.com'
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
  await pg.end()
  process.exit(2)
}
const userId = userRows[0].id

// Sanity: confirm the seed user actually has role='tourist' so the
// API's role check passes.
const { rows: profileRows } = await pg.query(
  `SELECT role FROM public.profiles WHERE id = $1`,
  [userId],
)
if (profileRows[0]?.role !== 'tourist') {
  console.error(`FATAL: ${SEED_EMAIL} role=${profileRows[0]?.role} (expected tourist)`)
  await pg.end()
  process.exit(2)
}

// 2. Pick 2 buddy IDs that exist in public.buddies (Da Nang)
const { rows: buddyRows } = await pg.query(
  `SELECT b.id, p.full_name FROM public.buddies b
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

// Verify the DB is now clean
const { rows: pre } = await pg.query(
  `SELECT COUNT(*)::int AS n FROM public.swipes WHERE swiper_role='tourist' AND swiper_id=$1`,
  [userId],
)
if (pre[0].n !== 0) {
  console.error(`FATAL: ${pre[0].n} pre-existing swipes still present after cleanup`)
  await pg.end()
  process.exit(2)
}
const browser = await chromium.launch({ headless: true })
try {
  const ctx = await browser.newContext({
    extraHTTPHeaders: { 'x-vercel-protection-bypass': BYPASS },
    viewport: { width: 1280, height: 900 },
  })
  const page = await ctx.newPage()
  // Clear any cookies/storage persisted from a prior run.
  await ctx.clearCookies()
  await page.goto('about:blank')

  // Login
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
  await page.fill('input#email', SEED_EMAIL)
  await page.fill('input#password', SEED_PW)
  await Promise.all([
    page.waitForURL('**/dashboard', { timeout: 15000 }),
    page.click('button:has-text("Sign in")'),
  ])

  // Open /browse
  await page.goto(`${BASE}/browse`, { waitUntil: 'domcontentloaded', timeout: 30000 })
  await page.waitForSelector('li button[aria-expanded]', { timeout: 30000 })

  // Sanity: the DB API starts empty
  const r0 = await page.evaluate(async () => {
    const r = await fetch('/api/swipe/saved-ids', { cache: 'no-store' })
    return await r.json()
  })
  assert('saved-ids starts empty', Array.isArray(r0.saved_ids) && r0.saved_ids.length === 0, JSON.stringify(r0))

  // Each list row is a <li>. The header button has aria-expanded.
  // When clicked, the same <li> renders a button[aria-pressed] (Save).
  // We pick the first two BUDDY rows (tourists don't have a Save
  // button) and save those.
  const rowCount = await page.locator('li button[aria-expanded]').count()
  assert('browse has at least 2 rows', rowCount >= 2, `rowCount=${rowCount}`)

  // Collect the indices of the first 2 BUDDY rows in DOM order.
  // Tourists appear mixed in now (location-first sort groups by
  // distance, so the 2 closest rows can be any role).
  const buddyIndices = await page.evaluate(() => {
    const out = []
    const headers = document.querySelectorAll('li button[aria-expanded]')
    for (let i = 0; i < headers.length; i++) {
      const badge = headers[i].querySelector('.badge')
      if (badge && badge.textContent.trim() === 'Buddy') {
        out.push(i)
        if (out.length === 2) break
      }
    }
    return out
  })
  if (buddyIndices.length < 2) {
    console.error(`FATAL: only ${buddyIndices.length} buddy rows visible`)
    process.exit(2)
  }

  // Helper: expand row at index i (clicking its header) and click
  // the Save button that appears inside the same <li>.
  const saveAt = async (i) => {
    // Find the row by its header button.
    const header = page.locator('li button[aria-expanded]').nth(i)
    await header.click()
    // Wait until the aria-expanded flips to "true" on this row, and
    // a button[aria-pressed] becomes visible inside the same <li>.
    await page.waitForFunction(
      (idx) => {
        const rows = document.querySelectorAll('li')
        const headers = document.querySelectorAll('li button[aria-expanded]')
        const h = headers[idx]
        if (!h || h.getAttribute('aria-expanded') !== 'true') return false
        // Walk up to the <li>
        let el = h.parentElement
        while (el && el.tagName !== 'LI') el = el.parentElement
        if (!el) return false
        return !!el.querySelector('button[aria-pressed]')
      },
      i,
      { timeout: 5000 },
    )
    // Click the Save button inside that <li>.
    await page.evaluate((idx) => {
      const headers = document.querySelectorAll('li button[aria-expanded]')
      const h = headers[idx]
      let el = h.parentElement
      while (el && el.tagName !== 'LI') el = el.parentElement
      const save = el.querySelector('button[aria-pressed]')
      if (save) save.click()
    }, i)
  }

  await saveAt(buddyIndices[0])
  await saveAt(buddyIndices[1])
  // Wait for the two POST /api/swipe calls to settle
  await page.waitForTimeout(2000)

  const r1 = await page.evaluate(async () => {
    const r = await fetch('/api/swipe/saved-ids', { cache: 'no-store' })
    return await r.json()
  })
  assert('saved-ids now has 2 entries', r1.saved_ids?.length === 2, JSON.stringify(r1.saved_ids))

  // Reload — verify hearts survive the round-trip. After reload the
  // page hydrates savedBuddies from /api/swipe/saved-ids, then re-renders
  // each row's Save button with aria-pressed=true if the buddy is in
  // the saved set. The page uses a single `expandedBuddyId` state
  // (accordion), so we expand one row at a time and check the
  // pressed heart for that row. The /browse page is now mixed
  // buddies + tourists, so we expand every row in DOM order (not
  // just the first N) and count pressed hearts among the BUDDY
  // rows.
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('li button[aria-expanded]', { timeout: 30000 })
  // Give the page time to fetch saved-ids and re-render.
  await page.waitForTimeout(2500)

  // Grab the saved IDs from the API.
  const savedIds = r1.saved_ids.slice() // from the previous fetch
  const buddyRowCount = await page.locator('li button[aria-expanded]').count()
  let pressedFound = 0
  for (let i = 0; i < buddyRowCount; i++) {
    // Only check buddy rows. Tourists don't have a Save button so
    // they can't contribute to pressedFound.
    const isBuddy = await page.evaluate((idx) => {
      const headers = document.querySelectorAll('li button[aria-expanded]')
      const h = headers[idx]
      if (!h) return false
      const badge = h.querySelector('.badge')
      return badge && badge.textContent.trim() === 'Buddy'
    }, i)
    if (!isBuddy) continue
    await page.evaluate((idx) => {
      const headers = document.querySelectorAll('li button[aria-expanded]')
      const h = headers[idx]
      if (!h) return
      if (h.getAttribute('aria-expanded') === 'false') h.click()
    }, i)
    await page.waitForTimeout(400)
    const c = await page.locator('button[aria-pressed="true"]').count()
    pressedFound += c
    // Collapse before next iteration.
    await page.evaluate((idx) => {
      const headers = document.querySelectorAll('li button[aria-expanded]')
      const h = headers[idx]
      if (h.getAttribute('aria-expanded') === 'true') h.click()
    }, i)
    await page.waitForTimeout(200)
  }
  assert('after reload, all saved hearts still filled', pressedFound === savedIds.length, `pressedFound=${pressedFound}, savedIds=${savedIds.length}`)

  // Unsave one. Expand the first BUDDY row (which should be one of
  // the saved buddies since location-first sort put them on top),
  // click its Save button, then verify the API count dropped.
  // Use the first saved buddy's index — that row's Save button is
  // guaranteed to be in the saved set.
  const firstSavedIndex = buddyIndices[0]
  await page.evaluate((idx) => {
    const headers = document.querySelectorAll('li button[aria-expanded]')
    const h = headers[idx]
    if (h.getAttribute('aria-expanded') === 'false') h.click()
  }, firstSavedIndex)
  await page.waitForTimeout(500)
  const firstSave = page.locator('button[aria-pressed]').first()
  await firstSave.click()
  await page.waitForTimeout(2000)
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
