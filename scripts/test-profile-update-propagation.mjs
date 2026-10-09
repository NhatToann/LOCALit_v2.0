// test-profile-update-propagation.mjs — verify profile edit appears elsewhere
import { chromium } from 'playwright'

const browser = await chromium.launch()
const ctx = await browser.newContext({
  extraHTTPHeaders: { 'x-vercel-protection-bypass': 'w6XAcwiXyFf9Pea8I6zwVONXAhc8Xs9A' },
  viewport: { width: 1280, height: 900 },
})
const page = await ctx.newPage()

// Login as Lan
await page.goto('https://localit-nhattoann.vercel.app/login', { waitUntil: 'domcontentloaded' })
await page.waitForSelector('#email')
await page.fill('#email', 'lan.pham@localit.dev')
await page.fill('#password', 'password123')
await page.click('button[type="submit"]')
await page.waitForURL((u) => !u.toString().includes('/login'), { timeout: 20000 })
console.log('[smoke] lan logged in')

// Open /profile
await page.goto('https://localit-nhattoann.vercel.app/profile', { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(3000)
await page.screenshot({ path: 'scripts/screenshots/edit-lan-before.png', fullPage: true })
console.log('[smoke] lan profile before edit')

// Find the bio field and update it
const bio = page.locator('textarea[name="bio"], textarea[placeholder*="bio" i], textarea').first()
if (await bio.count() > 0) {
  await bio.click({ clickCount: 3 })
  await bio.fill('Updated bio ' + Date.now())
  console.log('[smoke] bio typed')
}

// Find Save button
const saveBtn = page.locator('button:has-text("Save")').first()
if (await saveBtn.count() > 0) {
  await saveBtn.click()
  await page.waitForTimeout(2000)
  console.log('[smoke] save clicked')
}

await page.screenshot({ path: 'scripts/screenshots/edit-lan-after.png', fullPage: true })
console.log('[smoke] lan profile after edit')

// Now sign in as John and look at Lan's public profile
await page.context().clearCookies()
await page.goto('https://localit-nhattoann.vercel.app/login', { waitUntil: 'domcontentloaded' })
await page.waitForSelector('#email')
await page.fill('#email', 'john.doe@example.com')
await page.fill('#password', 'password123')
await page.click('button[type="submit"]')
await page.waitForURL((u) => !u.toString().includes('/login'), { timeout: 20000 })
console.log('[smoke] john logged in')

await page.goto('https://localit-nhattoann.vercel.app/buddies/11111111-1111-1111-1111-111111111111', { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(3000)
await page.screenshot({ path: 'scripts/screenshots/edit-lan-from-john.png', fullPage: true })
console.log('[smoke] john sees updated lan profile')

// Read the bio text to confirm
const updatedBio = await page.evaluate(() => document.body.innerText)
const hasUpdated = updatedBio.includes('Updated bio')
console.log('[smoke] bio visible cross-user:', hasUpdated)

await browser.close()
