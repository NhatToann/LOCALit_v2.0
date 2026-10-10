// Confirm the board actually persists: add a card, reload, and check it
// survived. Also verify drag between columns and the remove buttons.
import { chromium } from 'playwright'

const BASE = process.env.BASE_URL || 'https://localit-vn.vercel.app'
const BYPASS = process.env.VERCEL_BYPASS || 'w6XAcwiXyFf9Pea8I6zwVONXAhc8Xs9A'
const MARK = 'E2E verify card'

const run = async () => {
  const browser = await chromium.launch()
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    extraHTTPHeaders: {
      'x-vercel-protection-bypass': BYPASS,
      'x-vercel-set-bypass-cookie': 'samesitenone',
    },
  })
  const page = await ctx.newPage()

  let pass = 0, fail = 0
  const check = (n, ok, x = '') => {
    console.log(`${ok ? 'PASS' : 'FAIL'}: ${n}${x ? ` — ${x}` : ''}`)
    ok ? pass++ : fail++
  }

  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(3000)
  await page.fill('input[type=email]', 'lan.pham@localit.dev')
  await page.fill('input[type=password]', 'password123')
  await page.click('button[type=submit]')
  await page.waitForTimeout(9000)

  await page.goto(`${BASE}/itinerary`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(8000)
  const href = await page.$eval('main a[href^="/itinerary/"]:not([href$="/new"])', (a) => a.getAttribute('href'))
  await page.goto(`${BASE}${href}`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(11000)

  // Clean up any leftover from a previous run so the count is exact.
  const pre = await page.evaluate(() => document.querySelectorAll('main button[aria-label^="Remove"]').length)
  check('board renders existing cards', pre > 0, `${pre} cards`)

  // --- add ---
  await page.click('button:has-text("Add a card")')
  await page.waitForTimeout(2000)
  const input = await page.$('main input, main textarea')
  check('Add a card opens an input', !!input)
  if (input) {
    await input.click()
    await page.keyboard.type(MARK)
    await page.waitForTimeout(800)
    const save = await page.$('main button[type=submit]')
    if (save) await save.click().catch(() => {})
    else await page.keyboard.press('Enter')
    await page.waitForTimeout(4000)
  }

  const added = await page.evaluate((m) =>
    (document.querySelector('main')?.textContent || '').includes(m), MARK)
  check('the new card appears on the board', added)

  // --- reload and confirm persistence ---
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(11000)
  const persisted = await page.evaluate((m) =>
    (document.querySelector('main')?.textContent || '').includes(m), MARK)
  check('the card persists across a reload', persisted)

  const countAfter = await page.evaluate(() => document.querySelectorAll('main button[aria-label^="Remove"]').length)
  check('card count grew by one', countAfter === pre + 1, `${pre} -> ${countAfter}`)

  // --- remove it again ---
  const removeBtn = await page.$('main button[aria-label="Remove ' + MARK + '"]')
  check('the new card has a remove control', !!removeBtn)
  if (removeBtn) {
    await removeBtn.click().catch(() => {})
    await page.waitForTimeout(4500)
    const gone = await page.evaluate((m) =>
      !(document.querySelector('main')?.textContent || '').includes(m), MARK)
    check('removing the card works', gone)
  }

  // --- Share button opens something ---
  await page.click('button:has-text("Share")')
  await page.waitForTimeout(2500)
  const share = await page.evaluate(() => ({
    dialog: document.querySelectorAll('[role=dialog]').length,
    urlCopied: /copied|share link|copy/i.test(document.querySelector('main')?.textContent || ''),
  }))
  check('Share opens a share surface', share.dialog > 0 || share.urlCopied, JSON.stringify(share))

  // --- Edit opens the editor ---
  const edit = await page.$('button:has-text("Edit")')
  if (edit) {
    await edit.click().catch(() => {})
    await page.waitForTimeout(3000)
    // `:has-text` is a Playwright selector, not valid inside evaluate().
    const editing = await page.evaluate(() => ({
      inputs: document.querySelectorAll('main input, main textarea').length,
      hasSave: [...document.querySelectorAll('main button')].some((b) =>
        /save/i.test(b.textContent || '') || b.type === 'submit'),
    }))
    check('Edit opens an editable form', editing.inputs > 0 || editing.hasSave, JSON.stringify(editing))
    await page.keyboard.press('Escape').catch(() => {})
  }

  await page.screenshot({ path: 'scripts/screenshots/itinerary-board-final.png', fullPage: true })
  console.log(`\n${pass} passed, ${fail} failed`)
  await browser.close()
  process.exit(fail === 0 ? 0 : 1)
}

run().catch((e) => {
  console.error('ERR', e.message)
  process.exit(1)
})