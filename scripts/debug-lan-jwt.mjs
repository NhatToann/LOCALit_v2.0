import { chromium } from 'playwright'

const browser = await chromium.launch()
const ctx = await browser.newContext({
  extraHTTPHeaders: { 'x-vercel-protection-bypass': 'w6XAcwiXyFf9Pea8I6zwVONXAhc8Xs9A' },
  viewport: { width: 1280, height: 900 },
})
const page = await ctx.newPage()

await page.goto('https://localit-nhattoann.vercel.app/login', { waitUntil: 'domcontentloaded' })
await page.waitForSelector('#email')
await page.fill('#email', 'lan.pham@localit.dev')
await page.fill('#password', 'password123')
await page.click('button[type="submit"]')
await page.waitForURL((u) => !u.toString().includes('/login'), { timeout: 20000 })
console.log('logged in as lan')

// Use the Supabase client to read user role
const result = await page.evaluate(async () => null)
console.log('result:', result)

// Better: read the cookie value
const sb = await page.evaluate(() => {
  const c = document.cookie
  const parts = c.split('; ').find(p => p.startsWith('sb-pqvnjgyqbxlylawwogjv-auth-token='))
  if (!parts) return null
  const raw = decodeURIComponent(parts.split('=')[1])
  if (raw.startsWith('base64-')) {
    try {
      const json = JSON.parse(atob(raw.slice(7)))
      return {
        access_token_prefix: json.access_token?.slice(0, 30),
        user: json.user ? { id: json.user.id, email: json.user.email, role: json.user.role } : null,
      }
    } catch (e) {
      return { error: e.message }
    }
  }
  return { raw: raw.slice(0, 30) }
})
console.log('cookie:', JSON.stringify(sb, null, 2))

// Decode JWT
if (sb?.access_token_prefix) {
  const parts = sb.access_token_prefix.split('.')
  if (parts.length === 3) {
    const decoded = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')))
    console.log('JWT payload:', JSON.stringify(decoded, null, 2))
  }
}

// Go to /profile fresh
await page.goto('https://localit-nhattoann.vercel.app/profile', { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(4000)
const html = await page.content()
console.log('hasBuddyText:', html.includes('Buddy-specific bio'))
console.log('hasTouristText:', html.includes('Travel preferences'))
console.log('hasMyItineraries:', html.includes('My itineraries'))
console.log('hasSpecialties:', html.includes('Specialties you offer'))
console.log('hasFavoritePlaces:', html.includes('Favorite places'))
const titles = await page.locator('h2, h3').allTextContents()
console.log('h2/h3 titles:', titles.slice(0, 20))

await browser.close()
