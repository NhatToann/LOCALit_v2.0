// final-test.mjs — full E2E verification of profile update + avatars
import { chromium } from 'playwright'

const browser = await chromium.launch()
const ctx = await browser.newContext({
  extraHTTPHeaders: { 'x-vercel-protection-bypass': 'w6XAcwiXyFf9Pea8I6zwVONXAhc8Xs9A' },
  viewport: { width: 1280, height: 900 },
})
const page = await ctx.newPage()

async function login(email, pw) {
  await page.context().clearCookies()
  await page.goto('https://localit-nhattoann.vercel.app/login', { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('#email')
  await page.fill('#email', email)
  await page.fill('#password', pw)
  await page.click('button[type="submit"]')
  await page.waitForURL((u) => !u.toString().includes('/login'), { timeout: 20000 })
}

// === 1. Edit Linh's profile (buddy-specific bio) ===
await login('linh.tran@localit.dev', 'password123')
console.log('[1] logged in as Linh')
await page.goto('https://localit-nhattoann.vercel.app/profile', { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(5000)
await page.locator('button:has-text("Expertise & pricing")').first().click().catch(() => {})
await page.waitForTimeout(1500)
const bio = page.locator('#buddyBio')
if (await bio.count() > 0) {
  const newBio = 'Linh guide: Son Tra sunset + Banh Xeo cooking class. Final test ' + Date.now()
  await bio.fill(newBio)
  await page.locator('button:has-text("Save changes")').first().click()
  await page.waitForTimeout(4000)
  console.log('[1] saved Linh buddy bio')
}

await page.screenshot({ path: 'scripts/screenshots/final-linh-profile.png', fullPage: true })

// === 2. Sign in as John, view Linh's public profile ===
await login('john.doe@example.com', 'password123')
console.log('[2] logged in as John')
await page.goto('https://localit-nhattoann.vercel.app/buddies/44444444-4444-4444-4444-444444444444', { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(5000)
await page.screenshot({ path: 'scripts/screenshots/final-john-sees-linh.png', fullPage: true })
const johnText = await page.locator('body').textContent()
console.log('[2] John sees Linh bio (Buddy bio):', johnText?.includes('Linh guide'))

// === 3. /browse shows avatars for all users ===
await page.goto('https://localit-nhattoann.vercel.app/browse', { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(4500)
await page.screenshot({ path: 'scripts/screenshots/final-john-browse.png', fullPage: true })

// Count avatar images in browse
const browseAvatars = await page.locator('img[referrerpolicy="no-referrer"]').count()
console.log('[3] browse avatar images:', browseAvatars)

// === 4. /map shows avatars on pins ===
await page.goto('https://localit-nhattoann.vercel.app/map', { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(5500)
await page.screenshot({ path: 'scripts/screenshots/final-john-map.png', fullPage: true })

// Count avatar images inside leaflet markers
const mapAvatars = await page.locator('.leaflet-marker-icon img').count()
console.log('[4] map avatar images:', mapAvatars)

// === 5. John also views a tourist profile (avatar should show) ===
await page.goto('https://localit-nhattoann.vercel.app/tourists/f2df98b0-96cf-451d-9d85-5060ddc1ca01', { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(4000)
await page.screenshot({ path: 'scripts/screenshots/final-john-sees-phan.png', fullPage: true })

const touristAvatar = await page.locator('img[referrerpolicy="no-referrer"]').count()
console.log('[5] tourist profile avatar images:', touristAvatar)

await browser.close()
console.log('\nAll screenshots saved to scripts/screenshots/final-*.png')
