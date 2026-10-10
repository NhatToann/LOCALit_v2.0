// Narrow down WHY / and /map land at the footer after a reload.
// Tracks window.scrollY over time after reload, plus which element is
// focused and whether any ancestor is a scroll container.
import { chromium } from 'playwright'

const BASE = process.env.BASE_URL || 'https://localit-nhattoann.vercel.app'
const BYPASS = process.env.VERCEL_BYPASS || 'w6XAcwiXyFf9Pea8I6zwVONXAhc8Xs9A'
const PATHS = (process.env.PATHS || '/,/map').split(',')

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
    await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(3500)
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
    await page.waitForTimeout(900)

    // Start sampling scroll position on every animation frame right
    // after the reload commits, so we can see the exact moment the
    // page jumps rather than only the end state.
    await page.evaluate(() => {
      window.__samples = []
      const t0 = performance.now()
      const tick = () => {
        window.__samples.push([
          Math.round(performance.now() - t0),
          Math.round(window.scrollY),
        ])
        if (performance.now() - t0 < 3000) requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
    })
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(4500)

    const data = await page.evaluate(() => {
      const de = document.documentElement
      const s = window.__samples || []
      // Collapse consecutive identical scroll positions into jumps.
      const jumps = []
      for (let i = 1; i < s.length; i++) {
        if (Math.abs(s[i][1] - s[i - 1][1]) > 30) jumps.push({ t: s[i][0], from: s[i - 1][1], to: s[i][1] })
      }
      return {
        finalY: Math.round(window.scrollY),
        max: Math.round(de.scrollHeight - window.innerHeight),
        focus: document.activeElement?.tagName,
        restored: history.scrollRestoration,
        jumps: jumps.slice(0, 6),
        scrollBehavior: getComputedStyle(de).scrollBehavior,
        bodyOverflow: getComputedStyle(document.body).overflow,
        htmlOverflow: getComputedStyle(de).overflow,
        // Growth of the document AFTER the reload settles. If the page
        // was short at first paint and then hydrated into something much
        // taller, the browser has nothing to restore against and either
        // clamps to 0 or parks at whatever the new bottom is.
        heightNow: Math.round(de.scrollHeight),
        heightAtStart: window.__h0 ?? null,
      }
    })

    console.log(`\n=== ${path} ===`)
    console.log(
      `final scrollY=${data.finalY} / max=${data.max}   docHeight=${data.heightNow} (at first paint: ${data.heightAtStart})`,
    )
    console.log(`history.scrollRestoration=${data.restored}`)
    console.log(`html scroll-behavior=${data.scrollBehavior} overflow=${data.htmlOverflow}`)
    console.log(`body overflow=${data.bodyOverflow}   focus=${data.focus}`)
    console.log(`scroll jumps after reload: ${data.jumps.length}`)
    for (const j of data.jumps) console.log(`   t=${j.t}ms  ${j.from} -> ${j.to}`)
  }

  await browser.close()
}

run().catch((e) => {
  console.error('ERR', e.message)
  process.exit(1)
})