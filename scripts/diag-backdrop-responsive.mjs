import pkg from 'playwright-core'
const { chromium } = pkg
const Bypass = { 'x-vercel-protection-bypass': 'w6XAcwiXyFf9Pea8I6zwVONXAhc8Xs9A' }

const browser = await chromium.launch({ headless: true })
const VIEWPORTS = [
  { name: 'mobile-375', w: 375, h: 667 },
  { name: 'tablet-768', w: 768, h: 1024 },
  { name: 'laptop-1440', w: 1440, h: 900 },
]
let pass = 0, fail = 0

for (const vp of VIEWPORTS) {
  const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h }, extraHTTPHeaders: Bypass })
  const page = await ctx.newPage()
  await page.goto('https://localit-nhattoann.vercel.app/login', { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('input#password', { timeout: 15000 })
  await page.fill('input#email', 'john.doe@example.com')
  await page.fill('input#password', 'password123')
  await Promise.all([
    page.waitForURL(/\/dashboard/, { timeout: 20000 }),
    page.click('button[type="submit"]'),
  ]).catch(() => {})
  await page.waitForTimeout(2500)
  await page.screenshot({ path: `scripts/screenshots/bg-fixed-${vp.name}.png`, fullPage: false })

  const m = await page.evaluate(() => {
    const root = document.querySelector('.fixed.inset-0.-z-10')
    if (!root) return { err: 'no root' }
    const picture = root.querySelector('picture')
    const sources = picture ? Array.from(picture.querySelectorAll('source')).map((s) => ({
      media: s.media || '',
      srcset: (s.getAttribute('srcset') || '').slice(0, 130),
    })) : []
    const img = picture ? picture.querySelector('img') : null
    return {
      sources,
      imgSrc: img ? img.currentSrc.slice(0, 130) : null,
      imgNaturalW: img ? img.naturalWidth : null,
      imgObjFit: img ? getComputedStyle(img).objectFit : null,
      rootWH: { w: root.offsetWidth, h: root.offsetHeight },
    }
  })
  let ok = false
  if (vp.name === 'mobile-375') ok = /w=720/.test(m.imgSrc || '')
  else if (vp.name === 'tablet-768') ok = /w=1024/.test(m.imgSrc || '')
  else if (vp.name === 'laptop-1440') ok = /w=1920/.test(m.imgSrc || '')
  const lines = m.sources.map((s) => `    source[media="${s.media}"] -> ${s.srcset}`).join('\n')
  console.log(`\n${vp.name}: ${ok ? 'PASS' : 'FAIL'}`)
  console.log(`  img.currentSrc = ${m.imgSrc}`)
  console.log(`  img.naturalWidth = ${m.imgNaturalW}px  object-fit = ${m.imgObjFit}`)
  console.log(`  source count = ${m.sources.length}`)
  if (lines) console.log(lines)
  if (ok) pass++; else fail++
  await ctx.close()
}
console.log(`\n${pass} pass, ${fail} fail`)
await browser.close()