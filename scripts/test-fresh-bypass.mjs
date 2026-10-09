import { chromium } from 'playwright'

const browser = await chromium.launch()
const ctx = await browser.newContext({
  extraHTTPHeaders: { 'x-vercel-protection-bypass': 'w6XAcwiXyFf9Pea8I6zwVONXAhc8Xs9A' },
  viewport: { width: 1280, height: 900 },
})
const page = await ctx.newPage()

// Login as Linh
await page.goto('https://localit-nhattoann.vercel.app/login', { waitUntil: 'domcontentloaded' })
await page.waitForSelector('#email')
await page.fill('#email', 'linh.tran@localit.dev')
await page.fill('#password', 'password123')
await page.click('button[type="submit"]')
await page.waitForURL((u) => !u.toString().includes('/login'), { timeout: 20000 })

// Hard navigate with cache buster
const url = 'https://localit-nhattoann.vercel.app/buddies/11111111-1111-1111-1111-111111111111?cb=' + Date.now()
await page.goto(url, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(6000)

// Force browser to bypass cache
await page.evaluate(() => {
  if (window.caches) {
    caches.keys().then((keys) => keys.forEach((k) => caches.delete(k)))
  }
})
await page.reload({ waitUntil: 'domcontentloaded' })
await page.waitForTimeout(5000)
await page.screenshot({ path: 'scripts/screenshots/lan-bio-fresh.png', fullPage: true })

const txt = await page.evaluate(() => document.body.innerText)
console.log('has LAN_V3:', txt.includes('LAN_V3_'))
const m = txt.match(/About[\s\S]{0,200}/)
console.log('about section:', m?.[0]?.slice(0, 200))

await browser.close()
