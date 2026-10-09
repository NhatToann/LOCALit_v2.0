// test-avatar-display.mjs — visit /browse, /map, /profile, see if avatars render
import { chromium } from 'playwright'

const browser = await chromium.launch()
const ctx = await browser.newContext({
  extraHTTPHeaders: { 'x-vercel-protection-bypass': 'w6XAcwiXyFf9Pea8I6zwVONXAhc8Xs9A' },
  viewport: { width: 1280, height: 900 },
})
const page = await ctx.newPage()

// Sign in as John Doe (who has avatar)
await page.goto('https://localit-nhattoann.vercel.app/login', { waitUntil: 'domcontentloaded' })
await page.waitForSelector('#email')
await page.fill('#email', 'john.doe@example.com')
await page.fill('#password', 'password123')
await page.click('button[type="submit"]')
await page.waitForURL('**/dashboard', { timeout: 20000 })
console.log('[smoke] signed in as john.doe')

// Visit /profile to see own avatar
await page.goto('https://localit-nhattoann.vercel.app/profile', { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(3000)
await page.screenshot({ path: 'scripts/screenshots/avatar-own-profile.png', fullPage: true })
console.log('[smoke] own profile screenshot')

// Visit /browse to see other users' avatars
await page.goto('https://localit-nhattoann.vercel.app/browse', { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(4000)
await page.screenshot({ path: 'scripts/screenshots/avatar-browse.png', fullPage: true })
console.log('[smoke] browse screenshot')

// Visit /map
await page.goto('https://localit-nhattoann.vercel.app/map', { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(4000)
await page.screenshot({ path: 'scripts/screenshots/avatar-map.png', fullPage: true })
console.log('[smoke] map screenshot')

await browser.close()
console.log('[smoke] done')
