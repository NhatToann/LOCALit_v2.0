import { chromium } from 'playwright'

const browser = await chromium.launch()
const ctx = await browser.newContext({
  bypassCSP: true,
  extraHTTPHeaders: {
    'x-vercel-protection-bypass': 'w6XAcwiXyFf9Pea8I6zwVONXAhc8Xs9A',
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Pragma': 'no-cache',
  },
  viewport: { width: 1280, height: 900 },
})
const page = await ctx.newPage()

await page.goto('https://localit-nhattoann.vercel.app/login', { waitUntil: 'domcontentloaded' })
await page.waitForSelector('#email')
await page.fill('#email', 'linh.tran@localit.dev')
await page.fill('#password', 'password123')
await page.click('button[type="submit"]')
await page.waitForURL((u) => !u.toString().includes('/login'), { timeout: 20000 })

await page.route('**/buddies/**', async (route) => {
  const headers = { ...route.request().headers(), 'Cache-Control': 'no-cache' }
  await route.continue({ headers })
})

// Try with cache buster on URL too
const url = `https://localit-nhattoann.vercel.app/buddies/11111111-1111-1111-1111-111111111111?nocache=${Date.now()}`
await page.goto(url, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(6000)

const aboutPs = await page.locator('section h2:has-text("About")').locator('xpath=..').locator('p').allTextContents()
console.log('about <p> count:', aboutPs.length)
for (const t of aboutPs) console.log('  >', t)
console.log('has LAN_V3:', (await page.locator('body').textContent())?.includes('LAN_V3_'))

await page.screenshot({ path: 'scripts/screenshots/lan-bio-debug.png', fullPage: true })
await browser.close()
