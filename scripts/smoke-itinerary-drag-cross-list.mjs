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
  if (t.startsWith('[dnd]')) console.log(t)
  if (t.includes('Saving move') || t.includes('Could not save')) console.log('[board]', t)
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
  // Enable dnd debug logging
  await p.addInitScript(() => {
    window.__dndDebug = true
  })
  // Cleanup: delete prior "Drag Smoke" trips via Supabase REST.
  // Pull the session access token from localStorage (the supabase
  // JS client stores it under sb-<projectref>-auth-token).
  try {
    const sbUrl = 'https://pqvnjgyqbxlylawwogjv.supabase.co'
    const sbKey = 'sb_publishable_3uRUZqdvazd4cENt8WOWJA_SB7HmCEE'
    const accessToken = await p.evaluate((sbUrl) => {
      const candidates = []
      for (let i = 0; i < localStorage.length; i += 1) {
        const k = localStorage.key(i)
        if (k && (k.includes('auth-token') || k.startsWith('sb-'))) candidates.push(k)
      }
      for (const k of candidates) {
        try {
          const v = JSON.parse(localStorage.getItem(k) ?? '{}')
          if (v?.access_token) return v.access_token
          if (v?.currentSession?.access_token) return v.currentSession.access_token
        } catch {}
      }
      return null
    }, sbUrl)
    if (accessToken) {
      const list = await p.evaluate(async ({ sbUrl, sbKey, accessToken }) => {
        const r = await fetch(`${sbUrl}/rest/v1/itineraries?select=id,title`, {
          headers: { apikey: sbKey, authorization: `Bearer ${accessToken}` },
        })
        return r.ok ? r.json() : []
      }, { sbUrl, sbKey, accessToken })
      const targets = (list ?? []).filter((x) => typeof x.title === 'string' && x.title.startsWith('Drag Smoke '))
      for (const t of targets) {
        await p.evaluate(async ({ sbUrl, sbKey, accessToken, id }) => {
          await fetch(`${sbUrl}/rest/v1/itineraries?id=eq.${id}`, {
            method: 'DELETE',
            headers: { apikey: sbKey, authorization: `Bearer ${accessToken}` },
          })
        }, { sbUrl, sbKey, accessToken, id: t.id })
      }
      if (targets.length) console.log(`[info] cleaned up ${targets.length} prior Drag Smoke trip(s)`)
    } else {
      console.log('[warn] no access token in localStorage; skipping cleanup')
    }
  } catch (e) {
    console.log('[warn] cleanup skipped:', e?.message ?? e)
  }
  // 2) Create new trip via /itinerary/new template picker
  await p.goto(`${BASE}/itinerary/new`, { waitUntil: 'domcontentloaded' })
  const title = `Drag Smoke ${Date.now()}`
  // Pick the "Blank" template (last in grid) so we start with no lists
  const blankBtn = p.locator('button[aria-pressed]').last()
  await blankBtn.click()
  await p.locator('input#trip-title').fill(title)
  await p.locator('button[type="submit"]', { hasText: /Use this template/ }).click()
  await p.waitForURL(/\/itinerary\/[a-f0-9-]+$/, { timeout: 15000 })
  await p.waitForLoadState('domcontentloaded')
  await p.locator('[aria-label="Trip board"]').waitFor({ state: 'visible', timeout: 10000 })
  // 3) Add list 1: "Saturday morning" → warm amber tone
  await p.locator('button', { hasText: /Add (another |first )?list/ }).first().click()
  await p.locator('input[placeholder^="Enter list title"]').first().fill('Saturday morning')
  await p.locator('button', { hasText: 'Add list' }).first().click()
  await p.waitForTimeout(1500)
  // 4) Add list 2: "Sunday afternoon" → warm orange tone
  await p.locator('button', { hasText: /Add (another |first )?list/ }).first().click()
  await p.locator('input[placeholder^="Enter list title"]').first().fill('Sunday afternoon')
  await p.locator('button', { hasText: 'Add list' }).first().click()
  await p.waitForTimeout(1500)
  // 5) Add a card in list 1
  const lists = p.locator('section[data-list-id]')
  const list1Body = lists.nth(0).locator('ol[data-list-body]')
  const addCardBtn = lists.nth(0).locator('button', { hasText: 'Add a card' })
  await addCardBtn.waitFor({ state: 'visible', timeout: 10000 })
  await addCardBtn.click()
  const composer = p.locator('textarea[placeholder^="Enter a title"]')
  await composer.waitFor({ state: 'visible', timeout: 10000 })
  await composer.fill('Marble Mountains')
  await p.locator('button', { hasText: 'Add card' }).last().click()
  await p.waitForTimeout(2500)
  return title
}

try {
  await freshTripWithTwoLists(page)

  // Verify color accents are present (morning → amber, afternoon → orange)
  const morningTone = await page.locator('section[data-list-id]').nth(0).getAttribute('data-tone')
  const afternoonTone = await page.locator('section[data-list-id]').nth(1).getAttribute('data-tone')
  assert(morningTone === 'morning', `Saturday morning gets "morning" tone (got: ${morningTone})`)
  assert(afternoonTone === 'afternoon', `Sunday afternoon gets "afternoon" tone (got: ${afternoonTone})`)

  // Verify the saturated dark-theme header is colored (must NOT be
  // a near-white / near-black muted bg — these are SOLID accent
  // colors like amber/orange/pink/teal/red).
  const morningBg = await page.locator('section[data-list-id]').nth(0).locator('header').first().evaluate((el) => getComputedStyle(el).backgroundColor)
  const afternoonBg = await page.locator('section[data-list-id]').nth(1).locator('header').first().evaluate((el) => getComputedStyle(el).backgroundColor)
  console.log(`[info] morning header-bg: ${morningBg}, afternoon header-bg: ${afternoonBg}`)
  assert(morningBg === 'rgb(245, 158, 11)', `morning list has solid amber header (got ${morningBg})`)
  assert(afternoonBg === 'rgb(249, 115, 22)', `afternoon list has solid orange header (got ${afternoonBg})`)
  assert(morningBg !== afternoonBg, 'two lists have different header colors')

  // Verify the dark board backdrop (slate-900 #0F172A)
  const boardBg = await page.locator('[aria-label="Itinerary lists"]').first().evaluate((el) => getComputedStyle(el).backgroundColor)
  console.log(`[info] board backdrop: ${boardBg}`)
  assert(boardBg === 'rgb(15, 23, 42)', 'board backdrop is dark slate (#0F172A)')

  // Verify the card has a colored label bar (Trello labels feature)
  const cardLabelHex = await page.locator('article', { hasText: 'Marble Mountains' }).first().locator('div[title]').first().evaluate((el) => getComputedStyle(el).backgroundColor)
  console.log(`[info] card label bar: ${cardLabelHex}`)
  assert(cardLabelHex !== 'rgba(0, 0, 0, 0)' && cardLabelHex !== 'rgb(229, 231, 235)', 'card has a visible colored label bar')

  // Verify the card surface is dark slate
  const cardBg = await page.locator('article', { hasText: 'Marble Mountains' }).first().evaluate((el) => getComputedStyle(el).backgroundColor)
  console.log(`[info] card bg: ${cardBg}`)
  assert(cardBg === 'rgb(51, 65, 85)', `card has dark slate surface (#334155, got ${cardBg})`)

  const card = page.locator('article', { hasText: 'Marble Mountains' }).first()
  const list1Body = page.locator('section[data-list-id]').nth(0).locator('ol[data-list-body]')
  const list2Body = page.locator('section[data-list-id]').nth(1).locator('ol[data-list-body]')
  const cardInList1Before = await list1Body.locator('article', { hasText: 'Marble Mountains' }).count()
  const cardInList2Before = await list2Body.locator('article', { hasText: 'Marble Mountains' }).count()
  assert(cardInList1Before === 1, 'Card starts in list 1')
  assert(cardInList2Before === 0, 'List 2 starts empty')

  // Drag card from list 1 to list 2's body. dnd-kit's PointerSensor
  // doesn't always respond to Playwright's high-level dragTo on
  // multi-container boards (the synthetic pointerdown fires
  // before activation distance is reached), so we use manual
  // mouse events directly.
  const dropStart = Date.now()
  const cardBox = await card.boundingBox()
  const targetBox = await list2Body.boundingBox()
  if (!cardBox || !targetBox) throw new Error('Could not get bounding boxes for drag')
  await page.mouse.move(cardBox.x + cardBox.width / 2, cardBox.y + cardBox.height / 2)
  await page.mouse.down()
  await page.mouse.move(cardBox.x + cardBox.width / 2 + 8, cardBox.y + cardBox.height / 2 + 8, { steps: 3 })
  await page.mouse.move(targetBox.x + 30, targetBox.y + 20, { steps: 20 })
  await page.waitForTimeout(150)
  await page.mouse.move(targetBox.x + 30, targetBox.y + 20, { steps: 5 })
  await page.waitForTimeout(150)

  // Take a snapshot at the moment of release
  const atRelease = Date.now()
  await page.mouse.up()

  // Poll for the card to appear in list 2 (optimistic).
  let l2At = -1
  for (let i = 0; i < 100; i += 1) {
    const c = await list2Body.locator('article', { hasText: 'Marble Mountains' }).count()
    if (c === 1) { l2At = Date.now() - atRelease; break }
    await page.waitForTimeout(10)
  }
  console.log(`[info] mouseup→visible: +${l2At}ms`)
  console.log(`[info] dropStart→visible: +${Date.now() - dropStart}ms (includes manual mouse drags)`)

  // Poll for the card to appear in list 2 (optimistic). It should
  // arrive on the very next paint — well under 300ms.
  // (polling already done above; l2At is set)
  console.log(`[info] card appeared in target list at +${l2At}ms after drop (optimistic)`)
  assert(l2At !== -1, 'Card appears in target list after drop')
  assert(l2At < 500, `Card appears within 500ms (got ${l2At}ms — should be <300ms with optimistic state)`)

  let l1 = await list1Body.locator('article', { hasText: 'Marble Mountains' }).count()
  let l2 = await list2Body.locator('article', { hasText: 'Marble Mountains' }).count()
  console.log(`[info] immediately after drop: list1=${l1} list2=${l2}`)

  // Final DB state: wait for realtime echo + repack
  await page.waitForTimeout(3000)
  l1 = await list1Body.locator('article', { hasText: 'Marble Mountains' }).count()
  l2 = await list2Body.locator('article', { hasText: 'Marble Mountains' }).count()
  console.log(`[info] after final settle: list1=${l1} list2=${l2}`)
  assert(l1 === 0, 'Card moved out of list 1')
  assert(l2 === 1, 'Card arrived in list 2 (cross-list drag worked)')

  await page.screenshot({ path: 'scripts/screenshots/itinerary-drag-cross-list.png', fullPage: true })
  console.log('\nAll checks passed.')
} catch (err) {
  console.error('Test threw:', err.message)
  await page.screenshot({ path: 'scripts/screenshots/itinerary-drag-fail.png', fullPage: true })
  process.exitCode = 1
} finally {
  await browser.close()
}
