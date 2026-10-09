// test-avatar-cross-user.mjs — verify avatars show across users
import { chromium } from 'playwright'

const browser = await chromium.launch()
const ctx = await browser.newContext({
  extraHTTPHeaders: { 'x-vercel-protection-bypass': 'w6XAcwiXyFf9Pea8I6zwVONXAhc8Xs9A' },
  viewport: { width: 1280, height: 900 },
})
const page = await ctx.newPage()

async function login(email, pw) {
  await page.goto('https://localit-nhattoann.vercel.app/login', { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('#email')
  await page.fill('#email', email)
  await page.fill('#password', pw)
  await Promise.all([
    page.waitForURL((u) => !u.toString().includes('/login'), { timeout: 20000 }),
    page.click('button[type="submit"]'),
  ])
}

async function logout() {
  await page.evaluate(async () => {
    try { await fetch('/api/auth/signout', { method: 'POST' }) } catch {}
  })
  await page.context().clearCookies()
}

// 1. Login as Lan (buddy)
await login('lan.pham@localit.dev', 'password123')
console.log('[smoke] lan logged in')

await page.goto('https://localit-nhattoann.vercel.app/browse', { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(4500)
await page.screenshot({ path: 'scripts/screenshots/avatar-lan-browse.png', fullPage: true })
console.log('[smoke] lan /browse')

await page.goto('https://localit-nhattoann.vercel.app/map', { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(4500)
await page.screenshot({ path: 'scripts/screenshots/avatar-lan-map.png', fullPage: true })
console.log('[smoke] lan /map')

// Click a tourist profile link
await page.goto('https://localit-nhattoann.vercel.app/browse', { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(2500)
const link = page.locator('a[href^="/tourists/"]').first()
if (await link.count() > 0) {
  await link.click()
  await page.waitForTimeout(3000)
  await page.screenshot({ path: 'scripts/screenshots/avatar-lan-tourist-public.png', fullPage: true })
  console.log('[smoke] lan /tourists/[id]')
}

// 2. Switch to John Doe
await logout()
await login('john.doe@example.com', 'password123')
console.log('[smoke] john logged in')

await page.goto('https://localit-nhattoann.vercel.app/browse', { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(4500)
await page.screenshot({ path: 'scripts/screenshots/avatar-john-browse.png', fullPage: true })
console.log('[smoke] john /browse')

await page.goto('https://localit-nhattoann.vercel.app/map', { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(4500)
await page.screenshot({ path: 'scripts/screenshots/avatar-john-map.png', fullPage: true })
console.log('[smoke] john /map')

// 3. Open Lan's buddy profile (cross-user)
await page.goto('https://localit-nhattoann.vercel.app/buddies/11111111-1111-1111-1111-111111111111', { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(3000)
await page.screenshot({ path: 'scripts/screenshots/avatar-john-lan-profile.png', fullPage: true })
console.log('[smoke] john sees lan profile')

await browser.close()
console.log('[smoke] done')
