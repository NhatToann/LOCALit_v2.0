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

// Use the FRESH deployment directly
await page.goto('https://localit-887ztgy28-nhattoann.vercel.app/buddies/11111111-1111-1111-1111-111111111111', { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(6000)

const aboutPs = await page.locator('section h2:has-text("About")').locator('xpath=..').locator('p').allTextContents()
console.log('about <p> count:', aboutPs.length)
for (const t of aboutPs) console.log('  >', t)
const fullText = await page.locator('body').textContent()
console.log('has LAN_V3:', fullText?.includes('LAN_V3_'))
console.log('has PROPAGATION:', fullText?.includes('PROPAGATION'))

await page.screenshot({ path: 'scripts/screenshots/lan-fresh-deploy.png', fullPage: true })
await browser.close()
