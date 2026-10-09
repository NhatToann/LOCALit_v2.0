// scripts/smoke-browse-no-self.mjs
// 2026-10-09: verify the signed-in user never appears in their own /browse
// feed (or /map pins) even though their tourist row exists.
import { chromium } from 'playwright'

const BASE = 'https://localit-nhattoann.vercel.app'
const BYPASS = 'w6XAcwiXyFf9Pea8I6zwVONXAhc8Xs9A'

const browser = await chromium.launch({ headless: true })
try {
  const ctx = await browser.newContext({
    extraHTTPHeaders: { 'x-vercel-protection-bypass': BYPASS },
    viewport: { width: 1280, height: 900 },
  })
  const page = await ctx.newPage()

  // Sign in as Phan Nhật Toàn (tourist)
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('input#email', { timeout: 30000 })
  await page.fill('input#email', 'toan.phan@example.com')
  await page.fill('input#password', 'password123')
  await Promise.all([
    page.waitForURL('**/dashboard', { timeout: 15000 }),
    page.click('button:has-text("Sign in")'),
  ])

  await page.goto(`${BASE}/browse`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2500)

  const allText = await page.locator('body').textContent()
  const hasSelf = allText.includes('Phan Nhật Toàn')
  const rowCount = await page.locator('article, [role="row"], a[href^="/buddies/"]').count()
  console.log(`[smoke] Phan Nhật Toàn in /browse body: ${hasSelf}`)
  console.log(`[smoke] total list items: ${rowCount}`)

  if (hasSelf) {
    console.error('FAIL: self still visible in /browse')
    process.exit(1)
  } else {
    console.log('PASS: self NOT in /browse feed')
  }
} finally {
  await browser.close()
}
