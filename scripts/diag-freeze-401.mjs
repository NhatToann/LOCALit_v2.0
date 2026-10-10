// Locate the freeze: hit the pages that touch `reviews`, wait for the
// 401, then check whether the page is still interactive and whether a
// navigation attempt succeeds.
import { chromium } from 'playwright'

const BASE = process.env.BASE_URL || 'https://localit-nhattoann.vercel.app'
const BYPASS = process.env.VERCEL_BYPASS || 'w6XAcwiXyFf9Pea8I6zwVONXAhc8Xs9A'
const PATHS = (process.env.PATHS || '/browse,/dashboard,/profile,/chat').split(',')

const run = async () => {
  const browser = await chromium.launch()
  const ctx = await browser.newContext({
    extraHTTPHeaders: {
      'x-vercel-protection-bypass': BYPASS,
      'x-vercel-set-bypass-cookie': 'samesitenone',
    },
  })
  const page = await ctx.newPage()

  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2500)
  if (page.url().includes('/login')) {
    await page.fill('input[type=email]', 'lan.pham@localit.dev')
    await page.fill('input[type=password]', 'password123')
    await page.click('button[type=submit]')
    await page.waitForTimeout(5000)
  }

  for (const path of PATHS) {
    const net401 = []
    const netFail = []
    const onResp = (r) => {
      if (r.status() === 401) net401.push(r.url().slice(60, 130))
      if (r.status() === 0) netFail.push(r.url().slice(60, 130))
    }
    page.on('response', onResp)

    const t0 = Date.now()
    await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' })
    // Poll for up to 15s: is the app shell responsive while we wait?
    let interactiveAt = null
    for (let i = 0; i < 15; i++) {
      await page.waitForTimeout(1000)
      const s = await page.evaluate(() => ({
        spinner: !!document.querySelector('.loading-spinner'),
        links: document.querySelectorAll('a[href]').length,
        overlays: [...document.querySelectorAll('*')].filter((e) => {
          const cs = getComputedStyle(e)
          return (
            (cs.position === 'fixed' || cs.position === 'absolute') &&
            parseInt(cs.zIndex || '0', 10) > 100 &&
            e.getBoundingClientRect().width > window.innerWidth * 0.8 &&
            e.getBoundingClientRect().height > window.innerHeight * 0.8
          )
        }).map((e) => e.tagName + '.' + String(e.className).slice(0, 40)),
      }))
      if (!s.spinner) {
        interactiveAt = ((Date.now() - t0) / 1000).toFixed(1)
        console.log(
          `${path.padEnd(11)} shell ready in ${interactiveAt}s  links=${s.links}  overlays=${JSON.stringify(s.overlays)}`,
        )
        break
      }
    }
    if (interactiveAt === null) {
      console.log(`${path.padEnd(11)} STILL SPINNING after 15s — FROZEN`)
      const s = await page.evaluate(() => ({
        spinner: !!document.querySelector('.loading-spinner'),
        spinnerHTML: document.querySelector('.loading-spinner')?.outerHTML.slice(0, 120),
      }))
      console.log(`   spinner present: ${s.spinner}  ${s.spinnerHTML ?? ''}`)
    }
    if (net401.length) {
      console.log(`   401s: ${JSON.stringify([...new Set(net401)].slice(0, 3))}`)
    }
    page.off('response', onResp)
  }

  await browser.close()
}

run().catch((e) => {
  console.error('ERR', e.message)
  process.exit(1)
})