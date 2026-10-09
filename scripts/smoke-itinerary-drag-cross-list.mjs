// Cross-list drag-and-drop smoke for the Trello-style itinerary board.
//
// Verifies that a card can be dragged from one list to another, both
// for drops onto a card in the target list and drops onto the empty
// body of the target list. Also verifies the per-list color accent
// is applied to the list's <section>.
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
  const t = m.text()
  if (m.type() === 'error' && !t.includes('favicon')) console.error('[console.error]', t)
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

async function freshTripWithTwoLists(p) {
  // 1) Sign in
  await loginAs(p, SEED_USER.email, SEED_USER.password)
  // 2) Create new trip via the /itinerary/new form
  await p.goto(`${BASE}/itinerary/new`, { waitUntil: 'domcontentloaded' })
  const title = `Drag Smoke ${Date.now()}`
  await p.locator('input#title').fill(title)
  await p.locator('button[type="submit"]').click()
  await p.waitForURL(/\/itinerary\/[a-f0-9-]+$/, { timeout: 15000 })
  await p.waitForLoadState('domcontentloaded')
  await p.locator('[aria-label="Trip board"]').waitFor({ state: 'visible', timeout: 10000 })
  // 3) Add list 1: "Saturday morning" → warm amber tone
  await p.locator('button', { hasText: /Add (another |first )?list/ }).first().click()
  await p.locator('input[placeholder^="List title"]').first().fill('Saturday morning')
  await p.locator('button', { hasText: 'Add list' }).first().click()
  await p.waitForTimeout(1500)
  // 4) Add list 2: "Sunday afternoon" → warm orange tone
  await p.locator('button', { hasText: /Add (another |first )?list/ }).first().click()
  await p.locator('input[placeholder^="List title"]').first().fill('Sunday afternoon')
  await p.locator('button', { hasText: 'Add list' }).first().click()
  await p.waitForTimeout(1500)
  // 5) Add a card in list 1
  const lists = p.locator('section[data-list-id]')
  const list1Body = lists.nth(0).locator('ol[data-list-body]')
  await list1Body.locator('button', { hasText: 'Add a card' }).click()
  await list1Body.locator('textarea[placeholder^="Card name"]').fill('Marble Mountains')
  await list1Body.locator('button', { hasText: 'Add card' }).click()
  await p.waitForTimeout(2000)
  return title
}

try {
  await freshTripWithTwoLists(page)

  // Verify color accents are present (morning → amber, afternoon → orange)
  const morningTone = await page.locator('section[data-list-id]').nth(0).getAttribute('data-tone')
  const afternoonTone = await page.locator('section[data-list-id]').nth(1).getAttribute('data-tone')
  assert(morningTone === 'morning', `Saturday morning gets "morning" tone (got: ${morningTone})`)
  assert(afternoonTone === 'afternoon', `Sunday afternoon gets "afternoon" tone (got: ${afternoonTone})`)

  // Verify left border accent color is set
  const morningBorder = await page.locator('section[data-list-id]').nth(0).evaluate((el) => {
    return getComputedStyle(el).borderLeftColor
  })
  const afternoonBorder = await page.locator('section[data-list-id]').nth(1).evaluate((el) => {
    return getComputedStyle(el).borderLeftColor
  })
  console.log(`[info] morning border-left: ${morningBorder}, afternoon border-left: ${afternoonBorder}`)
  assert(morningBorder !== 'rgba(0, 0, 0, 0)' && morningBorder !== 'rgb(229, 231, 235)', 'morning list has visible colored left border')
  assert(afternoonBorder !== 'rgba(0, 0, 0, 0)' && afternoonBorder !== 'rgb(229, 231, 235)', 'afternoon list has visible colored left border')
  assert(morningBorder !== afternoonBorder, 'two lists have different accent colors')

  // Capture initial card location
  const card = page.locator('article', { hasText: 'Marble Mountains' }).first()
  const list1Body = page.locator('section[data-list-id]').nth(0).locator('ol[data-list-body]')
  const list2Body = page.locator('section[data-list-id]').nth(1).locator('ol[data-list-body]')
  const cardInList1Before = await list1Body.locator('article', { hasText: 'Marble Mountains' }).count()
  const cardInList2Before = await list2Body.locator('article', { hasText: 'Marble Mountains' }).count()
  assert(cardInList1Before === 1, 'Card starts in list 1')
  assert(cardInList2Before === 0, 'List 2 starts empty')

  // Drag card from list 1 to list 2's body (the empty area)
  const cardBox = await card.boundingBox()
  const targetBox = await list2Body.boundingBox()
  if (!cardBox || !targetBox) throw new Error('Could not get bounding boxes for drag')

  await page.mouse.move(cardBox.x + cardBox.width / 2, cardBox.y + cardBox.height / 2)
  await page.mouse.down()
  // Multi-step move so dnd-kit can register the over change
  await page.mouse.move(cardBox.x + cardBox.width / 2 + 20, cardBox.y + cardBox.height / 2 + 20, { steps: 5 })
  await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height - 5, { steps: 15 })
  await page.waitForTimeout(200)
  await page.mouse.up()
  await page.waitForTimeout(2500)

  const cardInList1After = await list1Body.locator('article', { hasText: 'Marble Mountains' }).count()
  const cardInList2After = await list2Body.locator('article', { hasText: 'Marble Mountains' }).count()
  console.log(`[info] after drag: list1=${cardInList1After} list2=${cardInList2After}`)
  assert(cardInList1After === 0, 'Card moved out of list 1')
  assert(cardInList2After === 1, 'Card arrived in list 2 (cross-list drag worked)')

  await page.screenshot({ path: 'scripts/screenshots/itinerary-drag-cross-list.png', fullPage: true })
  console.log('\nAll checks passed.')
} catch (err) {
  console.error('Test threw:', err.message)
  await page.screenshot({ path: 'scripts/screenshots/itinerary-drag-fail.png', fullPage: true })
  process.exitCode = 1
} finally {
  await browser.close()
}
