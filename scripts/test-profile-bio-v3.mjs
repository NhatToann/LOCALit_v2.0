import { chromium } from 'playwright'

const browser = await chromium.launch()
const ctx = await browser.newContext({
  extraHTTPHeaders: { 'x-vercel-protection-bypass': 'w6XAcwiXyFf9Pea8I6zwVONXAhc8Xs9A' },
  viewport: { width: 1280, height: 900 },
})
const page = await ctx.newPage()

// 1. Login as Lan
await page.goto('https://localit-nhattoann.vercel.app/login', { waitUntil: 'domcontentloaded' })
await page.waitForSelector('#email')
await page.fill('#email', 'lan.pham@localit.dev')
await page.fill('#password', 'password123')
await page.click('button[type="submit"]')
await page.waitForURL((u) => !u.toString().includes('/login'), { timeout: 20000 })

await page.goto('https://localit-nhattoann.vercel.app/profile', { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(5000)

const bio = page.locator('#bio')
const before = await bio.inputValue()
console.log('lan profile.bio before:', JSON.stringify(before))

const newProfileBio = 'LAN_V3_' + Date.now()
await bio.fill(newProfileBio)
const saveBtn = page.locator('button:has-text("Save changes")').first()
await saveBtn.click()
await page.waitForTimeout(5000)
console.log('saved:', newProfileBio)

// Verify in DB
import { Client } from 'pg'
const pg = new Client({ connectionString: 'postgresql://postgres:that1arlecchino@db.pqvnjgyqbxlylawwogjv.supabase.co:5432/postgres', ssl: { rejectUnauthorized: false } })
await pg.connect()
const r = await pg.query("SELECT bio FROM public.profiles WHERE id = '11111111-1111-1111-1111-111111111111'")
console.log('DB now:', r.rows[0])
await pg.end()

// 2. Switch to Linh, view Lan's public profile (with cache bypass)
await page.context().clearCookies()
const ctx2 = await browser.newContext({
  extraHTTPHeaders: { 'x-vercel-protection-bypass': 'w6XAcwiXyFf9Pea8I6zwVONXAhc8Xs9A' },
  viewport: { width: 1280, height: 900 },
})
const page2 = await ctx2.newPage()
await page2.goto('https://localit-nhattoann.vercel.app/login', { waitUntil: 'domcontentloaded' })
await page2.waitForSelector('#email')
await page2.fill('#email', 'linh.tran@localit.dev')
await page2.fill('#password', 'password123')
await page2.click('button[type="submit"]')
await page2.waitForURL((u) => !u.toString().includes('/login'), { timeout: 20000 })

// Hard navigate with cache bust
const url = 'https://localit-nhattoann.vercel.app/buddies/11111111-1111-1111-1111-111111111111?ts=' + Date.now()
await page2.goto(url, { waitUntil: 'domcontentloaded' })
await page2.waitForTimeout(6000)
await page2.screenshot({ path: 'scripts/screenshots/lan-bio-from-linh-v3.png', fullPage: true })

const txt = await page2.evaluate(() => document.body.innerText)
const hasNew = txt.includes('LAN_V3_')
console.log('Linh sees new Lan bio:', hasNew)
if (!hasNew) {
  // find what bio is shown
  const m = txt.match(/About[\s\S]{0,200}/)
  console.log('about section:', m?.[0]?.slice(0, 200))
}

await browser.close()
