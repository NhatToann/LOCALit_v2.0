// Dumps full DOM text after /buddies/[id] loads.
import { chromium } from 'playwright'

const PROD = 'https://localit-nhattoann.vercel.app'
const BYPASS = process.env.VERCEL_BYPASS ?? ''
const LAN = 'lan.pham@localit.dev'
const LAN_PW = 'password123'
const JOHN_ID = 'aaaa1111-1111-1111-1111-111111111111'

const browser = await chromium.launch({ headless: true })
const ctx = await browser.newContext({
  extraHTTPHeaders: BYPASS ? { 'x-vercel-protection-bypass': BYPASS } : {},
})
const page = await ctx.newPage()

page.on('console', (m) => {
  const t = m.type()
  if (t === 'error' || t === 'warning' || t === 'warn') {
    console.log(`[${t}]`, m.text().slice(0, 300))
  }
})
page.on('pageerror', (e) => console.log('[pageerror]', e.message))

await page.goto(`${PROD}/login`, { waitUntil: 'domcontentloaded' })
await page.fill('input[type="email"]', LAN)
await page.fill('input[type="password"]', LAN_PW)
await page.click('button[type="submit"]')
await page.waitForURL((u) => !u.toString().includes('/login'), { timeout: 30_000 })

await page.goto(`${PROD}/buddies/${JOHN_ID}`, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(4000)

// Look for any element whose text contains "Connect with"
const connectMatches = await page.getByText(/connect with/i).allTextContents()
console.log('\n[connect-with] matches:', connectMatches)

// Look for all action buttons
const actionArea = await page.locator('header').last()
const actionHtml = await actionArea.innerHTML().catch(() => '(no header)')
console.log('\n[last-header innerHTML] (truncated):', actionHtml.slice(0, 2000))

// Get the main container
const main = page.locator('main').first()
const mainText = await main.textContent().catch(() => '')
console.log('\n[main text]', mainText?.slice(0, 500))

await page.screenshot({ path: 'scripts/screenshots/diag-buddies-full.png', fullPage: true })
await browser.close()
