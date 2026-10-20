import pkg from 'playwright-core'
const { chromium } = pkg
const Bypass = { 'x-vercel-protection-bypass': 'w6XAcwiXyFf9Pea8I6zwVONXAhc8Xs9A' }

const browser = await chromium.launch({ headless: true })
const VIEWPORTS = [
  { name: 'mobile-375', w: 375, h: 667 },
  { name: 'mobile-414', w: 414, h: 896 },
  { name: 'tablet-768', w: 768, h: 1024 },
  { name: 'laptop-1440', w: 1440, h: 900 },
]

for (const vp of VIEWPORTS) {
  const ctx = await browser.newContext({
    viewport: { width: vp.w, height: vp.h },
    extraHTTPHeaders: Bypass,
  })
  const page = await ctx.newPage()
  await page.goto('https://localit-nhattoann.vercel.app/login', { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('input#password', { timeout: 20000 })
  await page.fill('input#email', 'john.doe@example.com')
  await page.fill('input#password', 'password123')
  await Promise.all([
    page.waitForURL(/\/dashboard|\/welcome|\/$/, { timeout: 20000 }),
    page.click('button[type="submit"]'),
  ]).catch(() => {})
  await page.waitForTimeout(1500)
  await page.screenshot({ path: `scripts/screenshots/bg-${vp.name}.png`, fullPage: false })
  const m = await page.evaluate(() => {
    const root = document.querySelector('.fixed.inset-0.-z-10')
    const layer = root ? root.querySelector('div[style*="background-image"]') : null
    return {
      url: location.href,
      rootWH: root ? { w: root.offsetWidth, h: root.offsetHeight } : null,
      layerWH: layer ? { w: layer.offsetWidth, h: layer.offsetHeight } : null,
      bgSize: layer ? getComputedStyle(layer).backgroundSize : null,
      bgPos: layer ? getComputedStyle(layer).backgroundPosition : null,
      photoSrc: layer ? layer.style.backgroundImage.slice(0, 130) : null,
    }
  })
  console.log(`${vp.name} (${vp.w}x${vp.h}): ${JSON.stringify(m)}`)
  await ctx.close()
}
await browser.close()