import pkg from 'playwright-core'
const { chromium } = pkg
const browser = await chromium.launch({ headless: true })
const ctx = await browser.newContext({
  bypassCSP: true,
  extraHTTPHeaders: { 'x-vercel-protection-bypass': 'w6XAcwiXyFf9Pea8I6zwVONXAhc8Xs9A' },
})
const page = await ctx.newPage()
await page.goto('https://localit-nhattoann.vercel.app/login', { waitUntil: 'domcontentloaded' })
await page.fill('input[type="email"]', 'john.doe@example.com')
await page.fill('input[type="password"]', 'password123')
await page.click('button[type="submit"]')
await page.waitForURL(/\/dashboard/, { timeout: 30000 })

const headings = await page.$$eval(
  'main h1, main h2, main h3',
  (els) =>
    els.map((el) => {
      const cs = getComputedStyle(el)
      let inCard = '(outside)'
      let p = el.parentElement
      while (p && p.tagName !== 'MAIN') {
        if (
          p.classList.contains('bg-paper') ||
          p.classList.contains('bg-surface')
        ) {
          inCard = p.tagName + '.' + (p.className.toString().split(/\s+/).find((c) => c.startsWith('bg-')) || '')
          break
        }
        p = p.parentElement
      }
      return {
        tag: el.tagName,
        cls: (el.className || '').toString().slice(0, 80),
        text: (el.textContent || '').slice(0, 50),
        color: cs.color,
        inCard,
      }
    }),
)
let pass = 0
let fail = 0
for (const h of headings) {
  const rgb = h.color.match(/\d+/g)?.map(Number) || []
  const isWhite = rgb.length >= 3 && rgb[0] > 240 && rgb[1] > 240 && rgb[2] > 240
  const isInk = rgb.length >= 3 && (rgb[0] + rgb[1] + rgb[2]) / 3 < 80
  const outside = h.inCard === '(outside)'
  const ok = outside ? isWhite : isInk
  if (ok) pass++
  else fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  <${h.tag}> ${h.text.padEnd(32)}  color=${h.color.padEnd(20)} ${outside ? 'outside' : 'in-card(' + h.inCard + ')'}`)
}
console.log(`\n${pass} pass, ${fail} fail`)
await browser.close()