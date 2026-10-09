// debug-buddybio.mjs
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

await page.goto('https://localit-nhattoann.vercel.app/profile', { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(4000)
// Hard reload to bust any cache
await page.reload({ waitUntil: 'domcontentloaded' })
await page.waitForTimeout(4000)

// Wait for at least 1 textarea
await page.locator('textarea').first().waitFor({ state: 'visible', timeout: 10000 })
await page.waitForTimeout(2000)
const textareas = await page.locator('textarea').count()
console.log('textareas:', textareas)
const ids = await page.locator('textarea').evaluateAll((els) => els.map((e) => e.id))
console.log('textarea ids:', ids)
const html = await page.locator('body').innerHTML()
const hasBuddyBio = html.includes('id="buddyBio"')
console.log('has buddyBio in HTML:', hasBuddyBio)
await page.screenshot({ path: 'scripts/screenshots/debug-lan-profile.png', fullPage: true })
console.log('saved debug-lan-profile.png')

await browser.close()
