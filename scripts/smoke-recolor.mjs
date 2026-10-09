// smoke-recolor.mjs — verify the new palette by signing in and screenshotting
// the home, login, and register pages.
import { chromium } from 'playwright'

const browser = await chromium.launch()
const ctx = await browser.newContext({
  extraHTTPHeaders: { 'x-vercel-protection-bypass': 'w6XAcwiXyFf9Pea8I6zwVONXAhc8Xs9A' },
  viewport: { width: 1280, height: 900 },
})
const page = await ctx.newPage()

const errors = []
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
page.on('requestfailed', (r) => {
  const u = r.url()
  if (u.includes('/avatars/') || u.includes('unsplash') || u.includes('realtime')) return
  errors.push(`requestfailed: ${u} — ${r.failure()?.errorText}`)
})

async function snap(url, name) {
  await page.goto(url, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2500)
  await page.screenshot({ path: `scripts/screenshots/recolor-${name}.png`, fullPage: true })
  console.log(`[smoke] snap ${name}`)
}

await snap('https://localit-nhattoann.vercel.app/', 'home')
await snap('https://localit-nhattoann.vercel.app/login', 'login')
await snap('https://localit-nhattoann.vercel.app/register', 'register')

// Sign in on the login page
await page.goto('https://localit-nhattoann.vercel.app/login', { waitUntil: 'domcontentloaded' })
await page.waitForSelector('#email')
await page.fill('#email', 'john.doe@example.com')
await page.fill('#password', 'password123')
await page.click('button[type="submit"]')
await page.waitForURL('**/dashboard', { timeout: 20000 })
console.log('[smoke] signed in')

await snap('https://localit-nhattoann.vercel.app/dashboard', 'dashboard')
await snap('https://localit-nhattoann.vercel.app/browse', 'browse')
await snap('https://localit-nhattoann.vercel.app/map', 'map')

console.log('\n=== Errors ===')
for (const e of errors) console.log(e)
console.log('\n[smoke] done')
await browser.close()
