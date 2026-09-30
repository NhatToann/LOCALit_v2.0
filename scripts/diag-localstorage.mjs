// Use Playwright to check actual localStorage keys in the deployed app.
import { chromium } from 'playwright'

const URL = 'https://localit-vn.vercel.app'

async function main() {
  const browser = await chromium.launch({ headless: true })
  const ctx = await browser.newContext()
  const page = await ctx.newPage()

  page.on('console', (m) => console.log('[console]', m.type(), m.text()))

  await page.goto(`${URL}/login`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1000)

  // Sign in via the UI form
  await page.fill('input[type="email"]', 'lan.pham@localit.dev')
  await page.fill('input[type="password"]', 'password123')
  await Promise.all([
    page.waitForURL((u) => !u.toString().includes('/login'), { timeout: 15000 }),
    page.click('button[type="submit"]'),
  ])
  await page.waitForTimeout(2000)

  // Now enumerate localStorage
  const ls = await page.evaluate(() => {
    const out = {}
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i)
      out[k] = window.localStorage.getItem(k)?.slice(0, 100)
    }
    return out
  })
  console.log('\nlocalStorage keys after signin:')
  console.log(JSON.stringify(ls, null, 2))

  // Specifically look for sb-*-auth-token keys
  const sbKeys = Object.keys(ls).filter((k) => k.includes('auth-token') || k.startsWith('sb-'))
  console.log('\nsb-* keys:', sbKeys)

  await browser.close()
}
main().catch((e) => {
  console.error('FATAL:', e)
  process.exit(1)
})
