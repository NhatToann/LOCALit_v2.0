import { chromium } from 'playwright'

const browser = await chromium.launch()
const ctx = await browser.newContext({
  extraHTTPHeaders: { 'x-vercel-protection-bypass': 'w6XAcwiXyFf9Pea8I6zwVONXAhc8Xs9A' },
  viewport: { width: 1280, height: 900 },
})
const page = await ctx.newPage()

await page.goto('https://localit-nhattoann.vercel.app/login', { waitUntil: 'domcontentloaded' })
await page.waitForSelector('#email')
await page.fill('#email', 'linh.tran@localit.dev')
await page.fill('#password', 'password123')
await page.click('button[type="submit"]')
await page.waitForURL((u) => !u.toString().includes('/login'), { timeout: 20000 })

// Go to profile
await page.goto('https://localit-nhattoann.vercel.app/profile', { waitUntil: 'domcontentloaded' })
// wait for the "Account" header or any view content
await page.waitForTimeout(6000)

// Get h1 text
const h1 = await page.locator('h1').first().textContent()
console.log('h1:', h1)

// Get h2
const h2s = await page.locator('h2').allTextContents()
console.log('h2:', h2s.slice(0, 10))

// Check the badge - TouristProfileView has badge "Tourist" near avatar, Buddy has "Buddy"
const badges = await page.locator('.badge').allTextContents()
console.log('badges:', badges.slice(0, 5))

// Check for specialties, hourly rate
const hasHourly = await page.locator('text=Hourly rate').count()
const hasSpecialtiesHeader = await page.locator('text=Specialties').count()
const hasBuddyBio = await page.locator('#buddyBio').count()
const hasAboutMe = await page.locator('#bio').count()
const hasTravelStyle = await page.locator('text=Travel style').count()
console.log('Hourly rate count:', hasHourly)
console.log('Specialties count:', hasSpecialtiesHeader)
console.log('buddyBio count:', hasBuddyBio)
console.log('bio count:', hasAboutMe)
console.log('Travel style count:', hasTravelStyle)

await page.screenshot({ path: 'scripts/screenshots/debug-linh-v3.png', fullPage: true })
await browser.close()
