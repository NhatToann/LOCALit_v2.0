// Is /dashboard actually blank? The browser snapshot showed a guest
// header + footer but no dashboard content, which would explain a
// user reporting "everything is broken". Capture the real DOM.
import pkg from 'playwright-core'
const { chromium } = pkg
const Bypass = { 'x-vercel-protection-bypass': 'w6XAcwiXyFf9Pea8I6zwVONXAhc8Xs9A' }
const BASE = 'https://localit-nhattoann.vercel.app'

const browser = await chromium.launch({ headless: true })
const ctx = await browser.newContext({ extraHTTPHeaders: Bypass })
const page = await ctx.newPage()

const errors = []
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message))
page.on('console', (m) => {
  if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 400))
})
page.on('response', (r) => {
  if (r.status() >= 400) errors.push(`http ${r.status()} ${r.url().slice(0, 120)}`)
})

// Sign in fresh
await page.goto(BASE + '/login', { waitUntil: 'domcontentloaded' })
await page.waitForSelector('#email, input[type="email"]', { timeout: 20000 })
await page.fill('#email', 'john.doe@example.com').catch(async () => {
  await page.fill('input[type="email"]', 'john.doe@example.com')
})
await page.fill('#password', 'password123').catch(async () => {
  await page.fill('input[type="password"]', 'password123')
})
await page.click('button[type="submit"]')
await page.waitForTimeout(7000)
console.log('After sign-in URL:', page.url())

// Now inspect /dashboard's <main>
await page.goto(BASE + '/dashboard', { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(6000)
const dash = await page.evaluate(() => {
  const main = document.querySelector('#main-content') || document.querySelector('main')
  const inner = main?.querySelector('main') || main
  return {
    mainExists: !!main,
    mainTextLen: (main?.innerText || '').trim().length,
    mainTextStart: (main?.innerText || '').trim().slice(0, 500),
    childCount: main?.children.length ?? 0,
    headerHasUserName: /john/i.test(document.querySelector('header')?.innerText || ''),
    hasLogoutOrAvatar: /sign out|log out|avatar/i.test(document.querySelector('header')?.innerText || ''),
  }
})
console.log('\n=== /dashboard ===')
console.log(JSON.stringify(dash, null, 2))
await page.screenshot({ path: 'scripts/screenshots/diag-dashboard.png', fullPage: false })

console.log('\n=== ERRORS ===')
const uniq = [...new Set(errors)]
if (uniq.length === 0) console.log('  (none)')
uniq.slice(0, 20).forEach((e) => console.log('  ' + e))

await browser.close()