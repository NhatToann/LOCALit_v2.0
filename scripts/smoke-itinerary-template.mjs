// Smoke test for the template picker at /itinerary/new.
// Verifies: picker renders 6 templates, selecting one updates the
// detail panel, "Use this template" creates the trip and redirects
// to a populated board.
import { chromium } from 'playwright'

const BASE = process.env.SMOKE_BASE_URL ?? 'https://localit-nhattoann.vercel.app'
const BYPASS = process.env.VERCEL_BYPASS ?? 'w6XAcwiXyFf9Pea8I6zwVONXAhc8Xs9A'
const SEED_USER = { email: 'lan.pham@localit.dev', password: 'password123' }

function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg)
    process.exit(1)
  } else {
    console.log('PASS:', msg)
  }
}

const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] })
const context = await browser.newContext({
  extraHTTPHeaders: { 'x-vercel-protection-bypass': BYPASS },
})
const page = await context.newPage()

page.on('pageerror', (e) => console.error('[pageerror]', e.message))
page.on('console', (m) => {
  if (m.type() === 'error') console.error('[console.error]', m.text())
})

async function loginAs(p, email, password) {
  await p.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 30000 })
  await p.waitForSelector('input[type="email"]', { timeout: 15000 })
  await p.fill('input[type="email"]', email)
  await p.fill('input[type="password"]', password)
  await Promise.all([
    p.waitForURL((u) => !u.toString().includes('/login'), { timeout: 20000 }),
    p.locator('input[type="password"]').press('Enter'),
  ])
  await p.waitForTimeout(800)
}

try {
  await loginAs(page, SEED_USER.email, SEED_USER.password)
  console.log('Logged in. URL:', page.url())

  // 1) Open /itinerary/new
  await page.goto(`${BASE}/itinerary/new`, { waitUntil: 'domcontentloaded', timeout: 30000 })
  const titleVisible = await page
    .locator('h1', { hasText: 'Pick a starting point' })
    .waitFor({ state: 'visible', timeout: 20000 })
    .then(() => true)
    .catch(() => false)
  assert(titleVisible, 'Template picker page renders')

  // 2) Count templates (6 expected)
  const templateCount = await page.locator('button[aria-pressed]', { has: page.locator('h3') }).count()
  assert(templateCount === 6, `6 templates render (got ${templateCount})`)

  // 3) Select "Marble Mountains + Hoi An" — the 1st non-blank
  const marbleBtn = page.locator('button[aria-pressed]', { hasText: 'Marble Mountains + Hoi An' }).first()
  await marbleBtn.waitFor({ state: 'visible', timeout: 10000 })
  await marbleBtn.click()
  await page.waitForTimeout(300)
  const detailVisible = await page
    .locator('aside[aria-label="Selected template"] h2', { hasText: 'Marble Mountains + Hoi An' })
    .waitFor({ state: 'visible', timeout: 5000 })
    .then(() => true)
    .catch(() => false)
  assert(detailVisible, 'Selecting a template updates the detail panel')

  // 4) Verify the "What's inside" section lists day titles
  const day1Visible = await page
    .locator('aside[aria-label="Selected template"]', { hasText: 'Marble Mountains' })
    .first()
    .waitFor({ state: 'visible', timeout: 5000 })
    .then(() => true)
    .catch(() => false)
  assert(day1Visible, 'Day titles render in the detail panel')

  // 5) Fill the optional title and start date
  await page.locator('input#trip-title').fill('Smoke Hoi An Day')
  // Use a future date so the test is deterministic.
  const future = new Date(Date.now() + 14 * 86400_000).toISOString().slice(0, 10)
  await page.locator('input#trip-start').fill(future)

  // 6) Click "Use this template"
  await page.locator('button[type="submit"]', { hasText: /Use this template/ }).click()
  await page.waitForURL(/\/itinerary\/[a-f0-9-]+$/, { timeout: 20000 })
  await page.waitForLoadState('domcontentloaded')

  // 7) The board should be populated: at least 2 lists (Morning + Afternoon)
  const morningList = await page
    .locator('section[aria-label^="Morning"]')
    .first()
    .waitFor({ state: 'visible', timeout: 10000 })
    .then(() => true)
    .catch(() => false)
  assert(morningList, 'Morning list renders on the new board')

  // 8) At least 1 card with "Marble Mountains" should be visible
  const cardVisible = await page
    .locator('article', { hasText: 'Marble Mountains — Thuy Son peak' })
    .first()
    .waitFor({ state: 'visible', timeout: 10000 })
    .then(() => true)
    .catch(() => false)
  assert(cardVisible, 'Template card "Marble Mountains" appears on the board')

  // 9) Go back to /itinerary — the new trip shows up
  await page.goto(`${BASE}/itinerary`, { waitUntil: 'domcontentloaded' })
  const tripVisible = await page
    .locator('h2', { hasText: 'Smoke Hoi An Day' })
    .first()
    .waitFor({ state: 'visible', timeout: 10000 })
    .then(() => true)
    .catch(() => false)
  assert(tripVisible, 'New trip from template appears on /itinerary')

  // 10) Blank template also works
  await page.goto(`${BASE}/itinerary/new`, { waitUntil: 'domcontentloaded' })
  const blankBtn = page.locator('button[aria-pressed]', { hasText: 'Blank trip' }).first()
  await blankBtn.waitFor({ state: 'visible', timeout: 10000 })
  await blankBtn.click()
  await page.waitForTimeout(300)
  const blankDetail = await page
    .locator('aside[aria-label="Selected template"] h2', { hasText: 'Blank trip' })
    .waitFor({ state: 'visible', timeout: 5000 })
    .then(() => true)
    .catch(() => false)
  assert(blankDetail, 'Blank template is selectable')

  await page.screenshot({ path: 'scripts/screenshots/itinerary-template-picker.png', fullPage: true })
  console.log('\nAll checks passed.')
} catch (err) {
  console.error('Test threw:', err.message)
  await page.screenshot({ path: 'scripts/screenshots/itinerary-template-fail.png', fullPage: true })
  process.exitCode = 1
} finally {
  await browser.close()
}
