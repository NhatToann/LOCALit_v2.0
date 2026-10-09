import { chromium } from 'playwright'

const browser = await chromium.launch()
const ctx = await browser.newContext({
  extraHTTPHeaders: { 'x-vercel-protection-bypass': 'w6XAcwiXyFf9Pea8I6zwVONXAhc8Xs9A' },
  viewport: { width: 1280, height: 900 },
})
const page = await ctx.newPage()

// Try a DIFFERENT user — Linh Tran
await page.goto('https://localit-nhattoann.vercel.app/login', { waitUntil: 'domcontentloaded' })
await page.waitForSelector('#email')
await page.fill('#email', 'linh.tran@localit.dev')
await page.fill('#password', 'password123')
await page.click('button[type="submit"]')
await page.waitForURL((u) => !u.toString().includes('/login'), { timeout: 20000 })
console.log('logged in as linh')

await page.goto('https://localit-nhattoann.vercel.app/profile', { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(4000)
const html = await page.content()
console.log('hasBuddyText:', html.includes('Buddy-specific bio'))
console.log('hasTouristText:', html.includes('Travel preferences'))
console.log('hasMyItineraries:', html.includes('My itineraries'))
console.log('hasSpecialties:', html.includes('Specialties'))
console.log('hasHourlyRate:', html.includes('Hourly rate'))
const titles = await page.locator('h2, h3').allTextContents()
console.log('h2/h3 titles:', titles.slice(0, 25))
await page.screenshot({ path: 'scripts/screenshots/debug-linh.png', fullPage: true })
await browser.close()
