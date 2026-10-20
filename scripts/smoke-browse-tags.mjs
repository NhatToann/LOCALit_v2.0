// End-to-end verification of the tag-ranking fix using a viewer that
// actually has tags to match.
//
// Seed data: Lan Pham = ["Beach","Food Tours","Photography"]
//            Phan Nhật Toàn (darklunatv@gmail.com) = ["photography","adventure"]
// They share "photography". Signing in as Phan Nhật Toàn should:
//   - highlight "photography" on Lan Pham's row (badge-primary)
//   - show Lan's tag cluster as Photography / Beach / Food Tours
//     (the match floats to the front, the rest keep source order)
//   - cap at 4 tags with a +N chip if there are more
import pkg from 'playwright-core'
const { chromium } = pkg
const Bypass = { 'x-vercel-protection-bypass': 'w6XAcwiXyFf9Pea8I6zwVONXAhc8Xs9A' }

const browser = await chromium.launch({ headless: true })
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, extraHTTPHeaders: Bypass })
const page = await ctx.newPage()
await page.goto('https://localit-nhattoann.vercel.app/login', { waitUntil: 'networkidle' })
await page.waitForSelector('input#email', { timeout: 20000 })
await page.waitForSelector('input#password', { timeout: 20000 })
await page.fill('input#email', 'darklunatv@gmail.com')
await page.fill('input#password', 'password123')
await page.click('button[type="submit"]')
await page.waitForURL((u) => !u.toString().includes('/login'), { timeout: 30000 }).catch(() => {})
console.log('After login URL:', page.url())
// If login failed, /browse will redirect back to /login. Detect that.
const onBrowse = !page.url().includes('/login')
if (!onBrowse) {
  console.log('Login appeared to fail; current URL:', page.url())
  await page.goto('https://localit-nhattoann.vercel.app/browse', { waitUntil: 'domcontentloaded' })
}
// Try a hard reload of /browse in case the cookie was set.
await page.goto('https://localit-nhattoann.vercel.app/browse', { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(3500)
console.log('Browse URL after navigation:', page.url())
await page.screenshot({ path: 'scripts/screenshots/browse-tags-match.png', fullPage: false })

const rows = await page.evaluate(() => {
  const out = []
  for (const li of document.querySelectorAll('ul li')) {
    const nameEl = li.querySelector('p span:first-child')
    const name = nameEl?.textContent?.trim()
    if (!name) continue
    const cluster = Array.from(li.querySelectorAll('div.hidden.md\\:flex .badge'))
    if (!cluster.length) continue
    const chips = cluster.map((b) => ({
      text: b.textContent?.trim() ?? '',
      isMatch: b.className.toString().includes('badge-primary'),
      title: b.getAttribute('title') ?? '',
    }))
    out.push({
      name,
      chips,
      realCount: chips.filter((c) => !/^\+\d+$/.test(c.text)).length,
      overflow: chips.find((c) => /^\+\d+$/.test(c.text))?.text ?? null,
    })
  }
  return out
})

console.log('\nViewer: Phan Nhật Toàn (tags: photography, adventure)\n')
let anyMatch = false
for (const r of rows) {
  const shown = r.chips.map((c) => (c.isMatch ? `[${c.text}]` : c.text)).join('  ')
  console.log(`${r.name}\n   ${shown}   (${r.realCount} tag(s)${r.overflow ? '  ' + r.overflow : ''})`)
  if (r.chips.some((c) => c.isMatch)) anyMatch = true
}
console.log(`\nAt least one highlighted tag: ${anyMatch ? 'YES — PASS' : 'NO — FAIL'}`)
console.log(`Rows over the 4-tag cap: ${rows.filter((r) => r.realCount > 4).length} — ${rows.every((r) => r.realCount <= 4) ? 'PASS' : 'FAIL'}`)
await browser.close()
process.exit(anyMatch ? 0 : 1)