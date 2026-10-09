// test-profile-update-propagation-v2.mjs — check more carefully
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

await page.goto('https://localit-nhattoann.vercel.app/profile', { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(3000)

// Read current bio
const beforeBio = await page.locator('textarea#bio').first().inputValue()
console.log('[smoke] current bio length:', beforeBio.length)

const newBio = 'PROPAGATION TEST ' + Date.now()
await page.locator('textarea#bio').first().fill(newBio)
console.log('[smoke] typed:', newBio)

// Find Save button — multiple buttons, find the one in the profile section
const buttons = page.locator('button:has-text("Save changes")')
const cnt = await buttons.count()
console.log('[smoke] save buttons count:', cnt)
if (cnt > 0) {
  await buttons.first().click()
  await page.waitForTimeout(4000)
  console.log('[smoke] saved')
}

// Now switch to John, look at Lan's profile with no cache
await page.context().clearCookies()
const ctx2 = await browser.newContext({
  extraHTTPHeaders: { 'x-vercel-protection-bypass': 'w6XAcwiXyFf9Pea8I6zwVONXAhc8Xs9A' },
  viewport: { width: 1280, height: 900 },
})
const page2 = await ctx2.newPage()
await page2.goto('https://localit-nhattoann.vercel.app/login', { waitUntil: 'domcontentloaded' })
await page2.waitForSelector('#email')
await page2.fill('#email', 'john.doe@example.com')
await page2.fill('#password', 'password123')
await page2.click('button[type="submit"]')
await page2.waitForURL((u) => !u.toString().includes('/login'), { timeout: 20000 })
console.log('[smoke] john logged in')

// Fetch Lan's public profile with cache bypass
const apiRes = await page2.request.get('https://localit-nhattoann.vercel.app/buddies/11111111-1111-1111-1111-111111111111', { headers: { 'Cache-Control': 'no-cache' } })
const body = await apiRes.text()
const hasNewBio = body.includes('PROPAGATION TEST')
console.log('[smoke] API response contains new bio:', hasNewBio)
console.log('[smoke] response length:', body.length)

await page2.goto('https://localit-nhattoann.vercel.app/buddies/11111111-1111-1111-1111-111111111111', { waitUntil: 'domcontentloaded' })
await page2.waitForTimeout(3000)
await page2.screenshot({ path: 'scripts/screenshots/edit-lan-from-john-v2.png', fullPage: true })
console.log('[smoke] john sees lan profile v2')

const visibleText = await page2.evaluate(() => document.body.innerText)
const hasVisible = visibleText.includes('PROPAGATION TEST')
console.log('[smoke] bio visible to john:', hasVisible)

await browser.close()
