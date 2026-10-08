// Test the /api/swipe/saved-ids endpoint directly using John's cookie
import { chromium } from 'playwright'

const BASE = 'https://localit-nhattoann.vercel.app'
const BYPASS = 'w6XAcwiXyFf9Pea8I6zwVONXAhc8Xs9A'
const SEED_EMAIL = 'john.doe@example.com'
const SEED_PW = 'password123'

const browser = await chromium.launch({ headless: true })
try {
  const ctx = await browser.newContext({
    extraHTTPHeaders: { 'x-vercel-protection-bypass': BYPASS },
    viewport: { width: 1280, height: 900 },
  })
  const page = await ctx.newPage()
  await ctx.clearCookies()
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
  await page.fill('input#email', SEED_EMAIL)
  await page.fill('input#password', SEED_PW)
  await Promise.all([
    page.waitForURL('**/dashboard', { timeout: 15000 }),
    page.click('button:has-text("Sign in")'),
  ])
  console.log('Logged in. Calling /api/swipe/saved-ids...')
  const r = await page.evaluate(async () => {
    const res = await fetch('/api/swipe/saved-ids', { cache: 'no-store' })
    return { status: res.status, body: await res.json() }
  })
  console.log('Response:', JSON.stringify(r))
  // Also try the SQL
  console.log('Cookie: ', (await ctx.cookies()).map((c) => c.name + '=' + c.value.slice(0, 40) + '...').join('; '))
} finally {
  await browser.close()
}
