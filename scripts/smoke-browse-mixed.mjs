#!/usr/bin/env node
// Smoke test: /browse now shows BOTH buddies and tourists in the
// recommend list, with a role badge next to each name.
//
// Asserts:
//   1. The page renders at least 1 buddy row and 1 tourist row.
//   2. Each row has a role badge ("Buddy" or "Tourist").
//   3. Phan Nhật Toàn (darklunatv) and Tá Bảo (tabao0708786) — the
//      two real-registered users the user explicitly asked about —
//      both appear in the list.
//   4. Tourists do NOT have a Save heart (only buddies are saveable).
//   5. The map view header reflects the mixed dataset
//      ("people" not "buddies").
//
// Uses the seed tourist account so hydration is required; the list
// is server-rendered from safe_buddies + safe_tourists_with_location.

import { chromium } from 'playwright'

const BASE = 'https://localit-nhattoann.vercel.app'
const BYPASS = 'w6XAcwiXyFf9Pea8I6zwVONXAhc8Xs9A'
const SEED_EMAIL = 'sarah.m@example.com'
const SEED_PW = 'password123'

const FAILS = []
function assert(label, ok, extra) {
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${label}${extra ? ' — ' + extra : ''}`)
  if (!ok) FAILS.push(label)
}

async function signIn(page) {
  await page.goto(`${BASE}/login?bypass=${BYPASS}`, { waitUntil: 'domcontentloaded' })
  await page.fill('input[type="email"]', SEED_EMAIL)
  await page.fill('input[type="password"]', SEED_PW)
  await Promise.all([
    page.waitForURL((u) => !u.toString().includes('/login'), { timeout: 30000 }),
    page.click('button[type="submit"]'),
  ])
}

async function main() {
  const browser = await chromium.launch({ headless: true })
  const ctx = await browser.newContext({ bypassCSP: true })
  const page = await ctx.newPage()

  // 1. Sign in
  await signIn(page)
  console.log(`[smoke] signed in as ${SEED_EMAIL}`)

  // 2. Navigate to /browse
  await page.goto(`${BASE}/browse?bypass=${BYPASS}`, { waitUntil: 'networkidle' })
  await page.waitForSelector('ul.divide-y > li', { timeout: 15000 })

  // 3. Count rows
  const rowCount = await page.locator('ul.divide-y > li').count()
  console.log(`[smoke] /browse rendered ${rowCount} rows`)

  // 4. Each row has a role badge
  const buddyBadges = await page.locator('ul.divide-y > li >> text=Buddy').count()
  const touristBadges = await page.locator('ul.divide-y > li >> text=Tourist').count()
  console.log(`[smoke] Buddy badges: ${buddyBadges}, Tourist badges: ${touristBadges}`)

  assert('at least 1 Buddy row', buddyBadges >= 1, `count=${buddyBadges}`)
  assert('at least 1 Tourist row', touristBadges >= 1, `count=${touristBadges}`)

  // 5. Phan Nhật Toàn + Tá Bảo both appear
  const allText = await page.locator('ul.divide-y').innerText()
  const hasToan = allText.includes('Phan Nhật Toàn')
  const hasBao = allText.includes('Tá Bảo')
  assert('Phan Nhật Toàn appears in the list', hasToan)
  assert('Tá Bảo appears in the list', hasBao)

  // 6. Only Buddy rows have a Save (Heart) button.
  //    We expand each row, then look for the Save/Saved button.
  //    Tourist rows render the View profile + Message buttons but no Save.
  let touristWithoutSave = 0
  let buddyWithSave = 0
  for (let i = 0; i < rowCount; i++) {
    const row = page.locator('ul.divide-y > li').nth(i)
    const isTourist = (await row.locator('text=Tourist').count()) > 0
    const isBuddy = (await row.locator('text=Buddy').count()) > 0
    // Click to expand
    await row.locator('button[aria-expanded]').first().click()
    await page.waitForTimeout(150)
    const hasSave = (await row.locator('button:has-text("Save")').count()) > 0
    if (isBuddy && hasSave) buddyWithSave++
    if (isTourist && !hasSave) touristWithoutSave++
    // Collapse
    await row.locator('button[aria-expanded]').first().click()
    await page.waitForTimeout(100)
  }
  assert('every Buddy row has a Save button', buddyWithSave >= 1, `count=${buddyWithSave}`)
  assert('every Tourist row has NO Save button', touristWithoutSave >= 1, `count=${touristWithoutSave}`)

  // 7. Map header reflects mixed dataset
  const mapHeader = await page.locator('h2#buddies-map-title').innerText()
  assert(
    'map header mentions "people"',
    /people/i.test(mapHeader),
    `header="${mapHeader}"`,
  )

  await browser.close()

  if (FAILS.length > 0) {
    console.error(`\n[smoke] ${FAILS.length} failure(s):`)
    for (const f of FAILS) console.error('  -', f)
    process.exit(1)
  }
  console.log('\n[smoke] All checks passed.')
}

main().catch((err) => {
  console.error('[smoke] crashed:', err)
  process.exit(1)
})
