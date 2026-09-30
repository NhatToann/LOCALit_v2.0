import { chromium } from 'playwright'
const URL = 'https://localit-vn.vercel.app'
async function main() {
  const browser = await chromium.launch({ headless: true })
  const ctx = await browser.newContext()
  const page = await ctx.newPage()
  await page.goto(`${URL}/login`, { waitUntil: 'networkidle' })
  await page.fill('input[type="email"]', 'lan.pham@localit.dev')
  await page.fill('input[type="password"]', 'password123')
  await Promise.all([
    page.waitForURL((u) => !u.toString().includes('/login'), { timeout: 15000 }),
    page.click('button[type="submit"]'),
  ])
  await page.waitForTimeout(2000)
  const cookies = await ctx.cookies()
  console.log('cookies:', cookies.length)
  for (const c of cookies) {
    console.log(`  ${c.name} (domain=${c.domain}, httpOnly=${c.httpOnly}, sameSite=${c.sameSite}) len=${c.value.length}`)
    if (c.name.includes('auth') || c.name.includes('sb-')) {
      console.log(`    value preview: ${c.value.slice(0, 120)}`)
    }
  }
  const ls = await page.evaluate(() => {
    const out = {}
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i)
      out[k] = (window.localStorage.getItem(k) ?? '').slice(0, 120)
    }
    return out
  })
  console.log('\nlocalStorage:')
  console.log(JSON.stringify(ls, null, 2))
  await browser.close()
}
main().catch((e) => { console.error(e); process.exit(1) })
