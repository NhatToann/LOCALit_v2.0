// scripts/playwright-board-test.mjs
// E2E: log in as Lan, open the seeded itinerary, switch to Board tab,
// drag a stop between buckets, verify the new column count.
import { chromium } from 'playwright'

const PROD_URL = process.env.PROD_URL || 'https://localit-nhattoann.vercel.app'
// Vercel automation-bypass secret (scope = "automation-bypass") so the
// browser can skip the SSO wall on every fresh deployment. Read from
// `scripts/.vercel-bypass-secret` so the secret doesn't live in this
// committed file.
import { readFileSync, existsSync } from 'node:fs'
let BYPASS_SECRET = process.env.VERCEL_BYPASS_SECRET
if (!BYPASS_SECRET && existsSync('scripts/.vercel-bypass-secret')) {
  BYPASS_SECRET = readFileSync('scripts/.vercel-bypass-secret', 'utf8').trim()
}
const ITIN_ID = process.env.ITIN_ID || '48ec487b-4a3a-4639-bcf0-fedbd9e90bd0'
const EMAIL = process.env.LAN_EMAIL || 'lan.pham@localit.dev'
const PASSWORD = process.env.LAN_PASS || 'password123'

const consoleErrors = []
const failures = []

function ok(name) { console.log('  ✓', name) }
function fail(name, e) { console.log('  ✗', name, '—', e?.message || e); failures.push({ name, err: e?.message || String(e) }) }

;(async () => {
  const browser = await chromium.launch({ headless: true })
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    extraHTTPHeaders: BYPASS_SECRET
      ? { 'x-vercel-protection-bypass': BYPASS_SECRET }
      : undefined,
  })
  const page = await ctx.newPage()
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text())
  })
  page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + e.message))

  try {
    // 1. Login
    await page.goto(PROD_URL + '/login', { waitUntil: 'load' })
    // Login page is a client component, BAILOUT_TO_CLIENT_SIDE_RENDERING.
    // Wait for hydration to mount the form.
    await page.waitForSelector('input[name="email"], #email', { timeout: 30_000, state: 'attached' })
    await page.waitForSelector('input[name="password"], #password', { timeout: 5_000, state: 'attached' })
    await page.fill('input[name="email"], #email', EMAIL)
    await page.fill('input[name="password"], #password', PASSWORD)
    await page.click('button[type="submit"]')
    await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 10_000 })
    ok('logged in as ' + EMAIL)

    // 2. Open itinerary
    await page.goto(PROD_URL + '/itinerary/' + ITIN_ID, { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('nav[role="tablist"]', { timeout: 10_000 })
    ok('itinerary page loaded')

    // 3. Click the Board tab
    const boardTab = page.locator('nav[role="tablist"] button:has-text("Board")')
    await boardTab.click()
    ok('clicked Board tab')

    // 4. Wait for at least one column with a stop card
    await page.waitForSelector('article[aria-label*="bucket"]', { timeout: 10_000 })
    const cardCount = await page.locator('article[aria-label*="bucket"]').count()
    if (cardCount < 4) {
      throw new Error(`expected ≥4 stop cards, got ${cardCount}`)
    }
    ok(`rendered ${cardCount} draggable stop cards`)

    // 5. Snapshot the column counts BEFORE drag
    const colsBefore = await page.evaluate(() => {
      const sections = Array.from(document.querySelectorAll('section[aria-label*="bucket"]'))
      return sections.map((s) => {
        const label = s.getAttribute('aria-label')
        const count = s.querySelectorAll('article[aria-label*="bucket"]').length
        return { label, count }
      })
    })
    console.log('   before:', JSON.stringify(colsBefore))

    // 6. Drag the first morning card to the afternoon column
    const morningCol = page.locator('section[aria-label="Morning bucket"] [data-bucket="morning"]')
    const afternoonCol = page.locator('section[aria-label="Afternoon bucket"] [data-bucket="afternoon"]')
    const firstCard = morningCol.locator('article[aria-label*="bucket"]').first()
    const cardName = await firstCard.locator('.text-ink').first().textContent()
    console.log('   dragging:', cardName)

    // dnd-kit needs a small mouse drag with deliberate steps
    const cardBox = await firstCard.boundingBox()
    const targetBox = await afternoonCol.boundingBox()
    if (!cardBox || !targetBox) throw new Error('missing bounding box')
    await page.mouse.move(cardBox.x + cardBox.width / 2, cardBox.y + cardBox.height / 2)
    await page.mouse.down()
    // small step to satisfy PointerSensor activation distance
    await page.mouse.move(cardBox.x + cardBox.width / 2 + 8, cardBox.y + cardBox.height / 2 + 8, { steps: 5 })
    await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + 40, { steps: 15 })
    await page.mouse.up()
    ok('dragged card to Afternoon column')

    // 7. Wait for the realtime to land
    await page.waitForTimeout(800)

    // 8. Snapshot the column counts AFTER drag
    const colsAfter = await page.evaluate(() => {
      const sections = Array.from(document.querySelectorAll('section[aria-label*="bucket"]'))
      return sections.map((s) => {
        const label = s.getAttribute('aria-label')
        const count = s.querySelectorAll('article[aria-label*="bucket"]').length
        return { label, count }
      })
    })
    console.log('   after :', JSON.stringify(colsAfter))

    const morningBefore = colsBefore.find((c) => c.label === 'Morning bucket')?.count ?? 0
    const morningAfter = colsAfter.find((c) => c.label === 'Morning bucket')?.count ?? 0
    const afternoonBefore = colsBefore.find((c) => c.label === 'Afternoon bucket')?.count ?? 0
    const afternoonAfter = colsAfter.find((c) => c.label === 'Afternoon bucket')?.count ?? 0
    if (morningAfter !== morningBefore - 1) {
      throw new Error(`morning count went ${morningBefore} → ${morningAfter}, expected -1`)
    }
    if (afternoonAfter !== afternoonBefore + 1) {
      throw new Error(`afternoon count went ${afternoonBefore} → ${afternoonAfter}, expected +1`)
    }
    ok('column counts updated correctly')

    // 9. Reload the page and confirm the move persisted to the DB
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.waitForSelector('nav[role="tablist"]', { timeout: 10_000 })
    await page.locator('nav[role="tablist"] button:has-text("Board")').click()
    await page.waitForSelector('article[aria-label*="bucket"]', { timeout: 10_000 })
    const persisted = await page.evaluate(() => {
      const sections = Array.from(document.querySelectorAll('section[aria-label*="bucket"]'))
      return sections.map((s) => ({
        label: s.getAttribute('aria-label'),
        count: s.querySelectorAll('article[aria-label*="bucket"]').length,
      }))
    })
    console.log('   reload:', JSON.stringify(persisted))
    const morningReload = persisted.find((c) => c.label === 'Morning bucket')?.count ?? 0
    const afternoonReload = persisted.find((c) => c.label === 'Afternoon bucket')?.count ?? 0
    if (morningReload !== morningAfter || afternoonReload !== afternoonAfter) {
      throw new Error(`reload mismatch: morning ${morningReload} vs ${morningAfter}, afternoon ${afternoonReload} vs ${afternoonAfter}`)
    }
    ok('drag persisted across page reload')

    // 10. Console errors?
    if (consoleErrors.length > 0) {
      console.log('   console errors:')
      for (const e of consoleErrors) console.log('     •', e)
    } else {
      ok('no console errors')
    }

    // 11. Screenshot
    await page.screenshot({ path: 'scripts/screenshots/board-after-drag.png', fullPage: true })
    ok('screenshot saved → scripts/screenshots/board-after-drag.png')

    console.log('\nALL CHECKS PASSED (' + (10 - failures.length) + '/10)')
  } catch (e) {
    fail('uncaught', e)
    try { await page.screenshot({ path: 'scripts/screenshots/board-failure.png', fullPage: true }) } catch {}
    try {
      const main = await page.evaluate(() => {
        const m = document.querySelector('main')
        return m ? m.innerHTML : 'NO MAIN'
      })
      console.log('--- main head ---')
      console.log(main.slice(0, 3000))
      console.log('--- end ---')
    } catch {}
  } finally {
    await browser.close()
    if (failures.length > 0) {
      console.log('\nFAILURES:')
      for (const f of failures) console.log('  ✗', f.name, '—', f.err)
      process.exit(1)
    }
  }
})()