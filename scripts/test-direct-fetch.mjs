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

// Direct fetch
const r = await page.request.get('https://localit-nhattoann.vercel.app/buddies/11111111-1111-1111-1111-111111111111', { headers: { 'Cache-Control': 'no-cache' } })
const text = await r.text()
const hasLANV3 = text.includes('LAN_V3_')
const hasOldBio = text.includes('PROPAGATION TEST')
console.log('hasLANV3:', hasLANV3)
console.log('hasOldBio:', hasOldBio)

// Look for the bio in the body
const m = text.match(/<section[^>]*>[\s\S]*?About[\s\S]*?<\/section>/)
console.log('about section found:', !!m)
if (m) console.log('about:', m[0].slice(0, 500))

await browser.close()
