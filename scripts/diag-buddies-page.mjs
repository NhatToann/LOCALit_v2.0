// Diagnostic — open /buddies/johnId as Lan, dump console + DOM, and
// check whether the page renders the Connect button or the error
// boundary.
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
  if (['error', 'warning', 'warn'].includes(t)) {
    console.log(`[${t}]`, m.text().slice(0, 250))
  }
})
page.on('pageerror', (e) => console.log('[pageerror]', e.message))
page.on('requestfailed', (r) => {
  if (!r.url().includes('hot-update') && !r.url().includes('unsplash')) {
    console.log('[reqfailed]', r.url().slice(0, 120), r.failure()?.errorText)
  }
})

// sign in
await page.goto(`${PROD}/login`, { waitUntil: 'domcontentloaded' })
await page.fill('input[type="email"]', LAN)
await page.fill('input[type="password"]', LAN_PW)
await page.click('button[type="submit"]')
await page.waitForURL((u) => !u.toString().includes('/login'), { timeout: 30_000 })
console.log('signed in, url=', page.url())

// navigate
await page.goto(`${PROD}/buddies/${JOHN_ID}`, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(3000)

// what buttons exist?
const buttons = await page.locator('button').allTextContents()
const links = await page.locator('a').allTextContents()
console.log('\nBUTTONS:', buttons.filter((b) => b.trim()))
console.log('\nLINKS (first 15):', links.filter((l) => l.trim()).slice(0, 15))

// is the page an error boundary?
const errorText = await page.getByText(/couldn't load this section|something went wrong|try again/i).count()
console.log('\nerror boundary visible:', errorText > 0)

await page.screenshot({ path: 'scripts/screenshots/diag-buddies-page.png', fullPage: true })

await browser.close()
