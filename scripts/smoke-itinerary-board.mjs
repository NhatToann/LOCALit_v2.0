// Smoke test for the new Trello-style itinerary board.
// Verifies: list view renders, click → board renders, add list works,
// add card works, card drawer opens, custom times save.
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

  // 1) Go to /itinerary
  await page.goto(`${BASE}/itinerary`, { waitUntil: 'domcontentloaded', timeout: 30000 })
  const listTitleVisible = await page
    .locator('h1', { hasText: /Your trips/ })
    .first()
    .waitFor({ state: 'visible', timeout: 20000 })
    .then(() => true)
    .catch(() => false)
  if (!listTitleVisible) {
    const url = page.url()
    const heading = await page.locator('h1').first().textContent().catch(() => '<none>')
    throw new Error(`Itinerary list page did not render. url=${url} heading=${heading}`)
  }
  assert(listTitleVisible, 'Itinerary list page renders')

  // 2) Click "New trip" link in the header
  await page.locator('a[href="/itinerary/new"]').first().click()
  await page.waitForURL(/\/itinerary\/new/, { timeout: 10000 })
  const newTitle = `Smoke Trip ${Date.now()}`
  await page.locator('input#trip-title').fill(newTitle)
  await page.locator('button[type="submit"]', { hasText: /Use this template/ }).click()

  // 3) Should land on /itinerary/<id> with board visible
  await page.waitForURL(/\/itinerary\/[a-f0-9-]+$/, { timeout: 15000 })
  await page.waitForLoadState('domcontentloaded')
  const boardPresent = await page
    .locator('[aria-label="Trip board"]')
    .waitFor({ state: 'visible', timeout: 10000 })
    .then(() => true)
    .catch(() => false)
  assert(boardPresent, 'Board mounts immediately on trip detail (no blocking spinner)')

  // 4) Add a list — pick the "Add first list" CTA in the empty board.
  const addListBtn = page.locator('button', { hasText: /Add (another |first )?list/ }).first()
  await addListBtn.waitFor({ state: 'visible', timeout: 10000 })
  await addListBtn.click()
  await page.waitForTimeout(300)
  const listTitleInput = page.locator('input[placeholder^="List title"]').first()
  await listTitleInput.waitFor({ state: 'visible', timeout: 10000 })
  await listTitleInput.fill('Saturday morning')
  await page.locator('button', { hasText: 'Add list' }).first().click()
  await page.waitForTimeout(2500)
  const listHeader = await page
    .locator('h3', { hasText: 'Saturday morning' })
    .first()
    .waitFor({ state: 'visible', timeout: 10000 })
    .then(() => true)
    .catch(() => false)
  assert(listHeader, 'New list appears in board')

  // 5) Add a card to the list
  await page.locator('button', { hasText: 'Add a card' }).first().click()
  await page.locator('textarea[placeholder^="Card name"]').fill('Marble Mountains')
  await page.locator('button', { hasText: 'Add card' }).click()
  await page.waitForTimeout(2500)
  const cardVisible = await page
    .locator('article', { hasText: 'Marble Mountains' })
    .first()
    .waitFor({ state: 'visible', timeout: 10000 })
    .then(() => true)
    .catch(() => false)
  assert(cardVisible, 'New card appears inside the list')

  // 6) Click the card → drawer opens
  await page.locator('article', { hasText: 'Marble Mountains' }).first().click()
  await page.waitForTimeout(500)
  const drawerVisible = await page
    .locator('[role="dialog"]', { hasText: 'Card name' })
    .first()
    .waitFor({ state: 'visible', timeout: 10000 })
    .then(() => true)
    .catch(() => false)
  assert(drawerVisible, 'Clicking card opens the detail drawer')

  // 7) Save the drawer with a custom time
  await page.locator('[role="dialog"] input[type="time"]').first().fill('09:00')
  await page.locator('[role="dialog"] input[type="time"]').nth(1).fill('11:30')
  await page.locator('[role="dialog"] button', { hasText: 'Save' }).first().click()
  await page.waitForTimeout(2500)
  const timeOnCard = await page
    .locator('article[aria-label*="Marble Mountains"]', { hasText: '09:00' })
    .first()
    .waitFor({ state: 'visible', timeout: 10000 })
    .then(() => true)
    .catch(() => false)
  assert(timeOnCard, 'Custom start time set on card')

  // 8) Add list with custom time window
  await page.locator('button', { hasText: /Add (another |first )?list/ }).first().click()
  await page.locator('input[placeholder^="List title"]').fill('Sunday afternoon')
  await page.locator('input[aria-label="List start time"]').fill('14:00')
  await page.locator('input[aria-label="List end time"]').fill('18:00')
  await page.locator('button', { hasText: 'Add list' }).click()
  await page.waitForTimeout(2500)
  const listRange = await page
    .locator('section[aria-label="Sunday afternoon"]')
    .first()
    .waitFor({ state: 'visible', timeout: 10000 })
    .then(() => true)
    .catch(() => false)
  assert(listRange, 'New list with custom time window appears')

  // 9) Go back to /itinerary — should show the new trip
  await page.goto(`${BASE}/itinerary`, { waitUntil: 'domcontentloaded' })
  const tripVisible = await page
    .locator('h2', { hasText: newTitle })
    .first()
    .waitFor({ state: 'visible', timeout: 10000 })
    .then(() => true)
    .catch(() => false)
  assert(tripVisible, 'New trip appears on /itinerary list')

  await page.screenshot({ path: 'scripts/screenshots/itinerary-board.png', fullPage: true })
  console.log('\nAll checks passed.')
} catch (err) {
  console.error('Test threw:', err.message)
  await page.screenshot({ path: 'scripts/screenshots/itinerary-board-fail.png', fullPage: true })
  process.exitCode = 1
} finally {
  await browser.close()
}
