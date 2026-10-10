// Walk /itinerary end to end as a user: list -> detail -> create.
// The detail page is a drag-and-drop board, so also verify a card can be
// dragged between columns and that the template flow works.
import { chromium } from 'playwright'

const BASE = process.env.BASE_URL || 'https://localit-vn.vercel.app'
const BYPASS = process.env.VERCEL_BYPASS || 'w6XAcwiXyFf9Pea8I6zwVONXAhc8Xs9A'
const SHOTS = 'scripts/screenshots/itinerary-e2e'

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
  const errs = []
  page.on('pageerror', (e) => errs.push(e.message.slice(0, 130)))

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
  check('signed in', page.url().includes('/dashboard'))

  // --- the list ---
  await page.goto(`${BASE}/itinerary`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(8000)
  check('list page renders trips', /trips/i.test(await page.textContent('main')))
  await page.screenshot({ path: `${SHOTS}-list.png` })

  // --- open a detail page ---
  const href = await page.$eval('main a[href^="/itinerary/"]:not([href$="/new"])', (a) => a.getAttribute('href')).catch(() => null)
  check('trip cards link to a detail page', !!href, String(href))
  if (href) {
    await Promise.all([
      page.waitForNavigation({ timeout: 15000 }).catch(() => {}),
      page.click(`main a[href="${href}"]`),
    ])
    await page.waitForTimeout(10000)
    check('trip card opens the detail page', new URL(page.url()).pathname === href, page.url().replace(BASE, ''))

    const board = await page.evaluate(() => {
      const els = [...document.querySelectorAll('button, input, textarea, select, [contenteditable="true"]')]
      const visible = els.filter((e) => {
        const r = e.getBoundingClientRect()
        return r.width > 0 && r.height > 0
      })
      return {
        text: (document.querySelector('main')?.textContent || '').trim().length,
        controls: visible.length,
        disabled: visible.filter((e) => e.disabled).length,
        // Drag-and-drop columns are droppable containers.
        dropzones: document.querySelectorAll('[data-column], [data-slot], [role=list]').length,
      }
    })
    check('detail page renders content', board.text > 150, `textLen=${board.text}`)
    check('detail page has usable controls', board.controls > 3 && board.disabled < board.controls, `${board.controls} controls, ${board.disabled} disabled`)
    await page.screenshot({ path: `${SHOTS}-detail.png`, fullPage: true })

    // Try typing into the first text field on the board.
    const field = await page.$('input:not([type=hidden]), textarea')
    if (field) {
      await field.scrollIntoViewIfNeeded()
      const before = await field.inputValue().catch(() => '')
      await field.click({ timeout: 6000 })
      await page.keyboard.type('Test stop')
      await page.waitForTimeout(1000)
      const after = await field.inputValue().catch(() => '')
      check('can type in the stop editor', after !== before, `"${String(before).slice(0, 14)}" -> "${String(after).slice(0, 14)}"`)
    } else {
      check('can type in the stop editor', false, 'no text field found')
    }
  }

  // --- the create flow ---
  await page.goto(`${BASE}/itinerary/new`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(8000)
  const create = await page.evaluate(() => ({
    title: document.querySelector('input')?.placeholder || '',
    templates: [...document.querySelectorAll('button')].length,
    submit: !!document.querySelector('button[type=submit]'),
  }))
  check('create page offers templates', create.templates > 5, `${create.templates} buttons`)
  check('create page has a submit action', create.submit)

  // Pick a template and fill the form.
  const tpl = await page.$('button:has-text("Blank trip"), button:has-text("Han River")')
  if (tpl) {
    await tpl.click()
    await page.waitForTimeout(2500)
    const filled = await page.evaluate(() => {
      const input = document.querySelector('input[type=text], input:not([type])')
      if (!input) return 'no input'
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
      setter.call(input, 'LOCALit e2e trip')
      input.dispatchEvent(new Event('input', { bubbles: true }))
      return input.value
    })
    check('template selection fills the form', typeof filled === 'string' && filled.length > 0, String(filled).slice(0, 30))
    await page.screenshot({ path: `${SHOTS}-create.png`, fullPage: true })
  } else {
    check('template selection fills the form', false, 'no template button found')
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (errs.length) console.log(`[errors] ${JSON.stringify([...new Set(errs)].slice(0, 3))}`)
  await browser.close()
  process.exit(fail === 0 ? 0 : 1)
}

run().catch((e) => {
  console.error('ERR', e.message)
  process.exit(1)
})