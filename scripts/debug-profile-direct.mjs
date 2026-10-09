import { chromium } from 'playwright'

const browser = await chromium.launch()
const ctx = await browser.newContext({
  extraHTTPHeaders: { 'x-vercel-protection-bypass': 'w6XAcwiXyFf9Pea8I6zwVONXAhc8Xs9A' },
  viewport: { width: 1280, height: 900 },
})
const page = await ctx.newPage()

// Sign in as Linh
await page.goto('https://localit-nhattoann.vercel.app/login', { waitUntil: 'domcontentloaded' })
await page.waitForSelector('#email')
await page.fill('#email', 'linh.tran@localit.dev')
await page.fill('#password', 'password123')
await page.click('button[type="submit"]')
await page.waitForURL((u) => !u.toString().includes('/login'), { timeout: 20000 })

// Get cookies
const cookies = await ctx.cookies()
const authCookie = cookies.find(c => c.name.includes('auth-token'))
console.log('auth cookie present:', !!authCookie)

// Use playwright request to fetch the page
const r = await page.request.get('https://localit-nhattoann.vercel.app/profile', {
  headers: { 'Cache-Control': 'no-cache', Pragma: 'no-cache' },
})
const text = await r.text()
console.log('response status:', r.status())
console.log('hasBuddyText:', text.includes('Buddy-specific bio'))
console.log('hasSpecialties:', text.includes('Specialties you offer'))
console.log('hasHourlyRate:', text.includes('Hourly rate'))
console.log('hasTouristText:', text.includes('Travel preferences'))
console.log('hasMyItineraries:', text.includes('My itineraries'))

// Count textareas in response
const matches = text.match(/textarea/g)
console.log('textarea tags in response:', matches?.length ?? 0)

// Find "buddy" vs "tourist" markers
const hasBuddyJSX = text.includes('"Specialties"') || text.includes('hourly_rate') || text.includes('"favorite_places"')
console.log('hasBuddyJSX markers:', hasBuddyJSX)

// Check for loading state
console.log('has loading-spinner:', text.includes('loading-spinner'))
console.log('has "Profile not found":', text.includes('Profile not found'))

// Look for form labels
const labels = text.match(/<label[^>]*>([^<]+)/g)
console.log('first 10 labels:', labels?.slice(0, 10))

// Look for any "Travel" or "Buddy"
console.log('has "Travel":', text.includes('Travel'))
console.log('has "Buddy":', text.includes('Buddy'))
console.log('has "Favorite places":', text.includes('Favorite places'))

// Save HTML for inspection
import { writeFileSync } from 'node:fs'
writeFileSync('scripts/screenshots/profile-response.html', text)
console.log('saved HTML to profile-response.html')

await browser.close()
