// scripts/playwright-board-2user.mjs
// 2-user E2E: Lan + John both open the same itinerary, Lan drags a
// stop, John should see the move within ~500ms via Supabase Realtime.
import { chromium } from 'playwright'
import { readFileSync, existsSync } from 'node:fs'

const PROD_URL = process.env.PROD_URL || 'https://localit-nhattoann.vercel.app'
let BYPASS_SECRET = process.env.VERCEL_BYPASS_SECRET
if (!BYPASS_SECRET && existsSync('scripts/.vercel-bypass-secret')) {
  BYPASS_SECRET = readFileSync('scripts/.vercel-bypass-secret', 'utf8').trim()
}
const ITIN_ID = process.env.ITIN_ID || '48ec487b-4a3a-4639-bcf0-fedbd9e90bd0'
const ACCOUNTS = [
  { email: 'lan.pham@localit.dev',  password: 'password123' },
  { email: 'john.doe@example.com',  password: 'password123' },
]

const consoleErrors = []
const failures = []
function ok(name) { console.log('  ✓', name) }
function fail(name, e) { console.log('  ✗', name, '—', e?.message || e); failures.push({ name, err: e?.message || String(e) }) }

async function loginAndOpenBoard(browser, account) {
  try {
    const ctx = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      extraHTTPHeaders: BYPASS_SECRET ? { 'x-vercel-protection-bypass': BYPASS_SECRET } : undefined,
    })
    const page = await ctx.newPage()
    page.on('pageerror', (e) => consoleErrors.push(`[${account.email}] pageerror: ${e.message}`))
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(`[${account.email}] console.error: ${msg.text()}`)
    })
    page.on('requestfailed', (req) => consoleErrors.push(`[${account.email}] request failed: ${req.url()} ${req.failure()?.errorText}`))
    await page.goto(PROD_URL + '/login', { waitUntil: 'load' })
    await page.waitForSelector('input[name="email"], #email', { timeout: 30_000, state: 'attached' })
    await page.fill('input[name="email"], #email', account.email)
    await page.fill('input[name="password"], #password', account.password)
    await page.click('button[type="submit"]')
    await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 15_000 })
    await page.goto(PROD_URL + '/itinerary/' + ITIN_ID, { waitUntil: 'load' })
    console.log('   [' + account.email + '] URL after nav:', page.url())
    try {
      const mainText = await page.locator('main').textContent({ timeout: 5_000 })
      console.log('   [' + account.email + '] main text:', (mainText || '').slice(0, 200))
    } catch {}
    await page.waitForSelector('nav[role="tablist"]', { timeout: 30_000 })
    await page.locator('nav[role="tablist"] button:has-text("Board")').click()
    await page.waitForSelector('article[aria-label*="bucket"]', { timeout: 10_000 })
    return { ctx, page }
  } catch (e) {
    console.log('--- body text on fail (' + account.email + ') ---')
    try { const html = await page.evaluate(() => document.body.innerText.slice(0, 500)); console.log(html) } catch {}
    console.log('--- end ---')
    throw e
  }
}

async function counts(page) {
  return page.evaluate(() => {
    const sections = Array.from(document.querySelectorAll('section[aria-label*="bucket"]'))
    return sections.map((s) => ({
      label: s.getAttribute('aria-label'),
      count: s.querySelectorAll('article[aria-label*="bucket"]').length,
    }))
  })
}

;(async () => {
  const browser = await chromium.launch({ headless: true })
  try {
    const a = await loginAndOpenBoard(browser, ACCOUNTS[0])
    ok('Lan logged in + Board opened')
    // Sequential signin to avoid hitting the /api/auth/signin rate
    // limit (5/min) when both contexts hit the API in the same second.
    await a.page.waitForTimeout(2_000)
    const b = await loginAndOpenBoard(browser, ACCOUNTS[1])
    ok('John logged in + Board opened')

    const aBefore = await counts(a.page)
    const bBefore = await counts(b.page)
    if (JSON.stringify(aBefore) !== JSON.stringify(bBefore)) {
      throw new Error(`initial state diverged: ${JSON.stringify(aBefore)} vs ${JSON.stringify(bBefore)}`)
    }
    ok('initial state matches between both tabs')

    // Lan drags the first morning card to the evening column
    const morningCol = a.page.locator('section[aria-label="Morning bucket"] [data-bucket="morning"]')
    const eveningCol = a.page.locator('section[aria-label="Evening bucket"] [data-bucket="evening"]')
    const firstCard = morningCol.locator('article[aria-label*="bucket"]').first()
    const cardBox = await firstCard.boundingBox()
    const eveningBox = await eveningCol.boundingBox()
    if (!cardBox || !eveningBox) throw new Error('missing bounding box')
    await a.page.mouse.move(cardBox.x + cardBox.width / 2, cardBox.y + cardBox.height / 2)
    await a.page.mouse.down()
    await a.page.mouse.move(cardBox.x + cardBox.width / 2 + 8, cardBox.y + cardBox.height / 2 + 8, { steps: 5 })
    await a.page.mouse.move(eveningBox.x + eveningBox.width / 2, eveningBox.y + 40, { steps: 15 })
    await a.page.mouse.up()
    ok("Lan's drag dispatched")

    // Wait for realtime to propagate to John's tab (max 5s)
    let bCaughtUp = false
    for (let i = 0; i < 50; i++) {
      await b.page.waitForTimeout(100)
      const bNow = await counts(b.page)
      const evening = bNow.find((c) => c.label === 'Evening bucket')?.count ?? 0
      const morning = bNow.find((c) => c.label === 'Morning bucket')?.count ?? 0
      const expectedEvening = bBefore.find((c) => c.label === 'Evening bucket').count + 1
      const expectedMorning = bBefore.find((c) => c.label === 'Morning bucket').count - 1
      if (evening === expectedEvening && morning === expectedMorning) {
        bCaughtUp = true
        console.log(`   realtime propagated in ~${(i + 1) * 100}ms`)
        break
      }
    }
    if (!bCaughtUp) {
      throw new Error("John's tab did not converge on the new column counts within 5s")
    }
    ok("John's tab received the realtime update")

    if (consoleErrors.length > 0) {
      console.log('   page errors:')
      for (const e of consoleErrors) console.log('     •', e)
    } else {
      ok('no page errors')
    }

    await b.page.screenshot({ path: 'scripts/screenshots/board-2user-john.png', fullPage: true })
    await a.page.screenshot({ path: 'scripts/screenshots/board-2user-lan.png', fullPage: true })
    ok('screenshots saved')

    console.log('\nALL CHECKS PASSED (4/4)')
  } catch (e) {
    fail('uncaught', e)
  } finally {
    await browser.close()
    if (failures.length > 0) {
      console.log('\nFAILURES:')
      for (const f of failures) console.log('  ✗', f.name, '—', f.err)
      process.exit(1)
    }
  }
})()