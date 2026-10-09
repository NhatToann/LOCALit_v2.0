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

// Check the data sent to the page
const r = await page.request.get('https://localit-nhattoann.vercel.app/profile?__rsc=1', { headers: { RSC: '1' } })
const text = await r.text()
const hasBuddy = text.includes('Buddy-specific bio')
const hasSpecialties = text.includes('Specialties')
const hasHourlyRate = text.includes('Hourly rate')
const hasFavoritePlaces = text.includes('Favorite places')
const hasAboutMe = text.includes('About me')
const hasMyItineraries = text.includes('My itineraries')
console.log('hasBuddy (buddy-specific bio):', hasBuddy)
console.log('hasSpecialties:', hasSpecialties)
console.log('hasHourlyRate:', hasHourlyRate)
console.log('hasFavoritePlaces:', hasFavoritePlaces)
console.log('hasAboutMe:', hasAboutMe)
console.log('hasMyItineraries:', hasMyItineraries)

// Save for inspection
const { writeFileSync } = await import('node:fs')
writeFileSync('scripts/screenshots/rsc.txt', text)
console.log('saved RSC payload to rsc.txt (length:', text.length, ')')

await browser.close()
