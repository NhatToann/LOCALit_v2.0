// smoke-avatar-upload.mjs — login as john.doe, upload an avatar, verify
// no 4xx in the network log, then screenshot the profile page.
import { chromium } from 'playwright'

const browser = await chromium.launch()
const ctx = await browser.newContext({
  extraHTTPHeaders: { 'x-vercel-protection-bypass': 'w6XAcwiXyFf9Pea8I6zwVONXAhc8Xs9A' },
})
const page = await ctx.newPage()

const errors = []
const failed = []
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
page.on('requestfailed', (r) => failed.push(`requestfailed: ${r.url()} — ${r.failure()?.errorText}`))
page.on('response', (r) => {
  if (r.status() >= 400) {
    failed.push(`HTTP ${r.status()}: ${r.url()}`)
  }
})

// 1. Visit login
await page.goto('https://localit-nhattoann.vercel.app/login', { waitUntil: 'domcontentloaded' })
await page.waitForSelector('#email', { timeout: 10000 })
await page.waitForSelector('#password', { timeout: 10000 })

// 2. Sign in
await page.fill('#email', 'john.doe@example.com')
await page.fill('#password', 'password123')
await page.click('button[type="submit"]')
await page.waitForURL('**/dashboard', { timeout: 20000 })
console.log('[smoke] signed in, on', page.url())

// 3. Visit profile page
await page.goto('https://localit-nhattoann.vercel.app/profile', { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(3000)

// 4. Find the file input for avatar
const fileInput = page.locator('input[type="file"][accept*="image"]').first()
if (await fileInput.count() === 0) {
  console.log('[smoke] no file input found on /profile — checking TouristProfileView')
  // Maybe the profile page is a different layout — try going through the dashboard
  await page.goto('https://localit-nhattoann.vercel.app/dashboard', { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(3000)
  // Look for a profile link
  const profileLink = page.locator('a[href*="profile"]').first()
  if (await profileLink.count() > 0) {
    await profileLink.click()
    await page.waitForTimeout(2000)
  }
}

const finalInput = page.locator('input[type="file"][accept*="image"]').first()
const exists = await finalInput.count()
console.log('[smoke] file input count:', exists)

if (exists > 0) {
  // Build a minimal PNG buffer
  const png = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
    0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
    0x89, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x44, 0x41,
    0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
    0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00,
    0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae,
    0x42, 0x60, 0x82,
  ])
  await finalInput.setInputFiles({
    name: 'avatar-test.png',
    mimeType: 'image/png',
    buffer: png,
  })
  console.log('[smoke] uploaded file via input')
  await page.waitForTimeout(3000)
}

await page.screenshot({ path: 'scripts/screenshots/avatar-upload-test.png', fullPage: true })
console.log('[smoke] screenshot saved')

console.log('\n=== Failed requests ===')
for (const f of failed) console.log(f)
console.log('\n=== Page errors ===')
for (const e of errors) console.log(e)

await browser.close()
console.log('\n[smoke] done')
