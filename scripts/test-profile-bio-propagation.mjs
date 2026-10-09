import { chromium } from 'playwright'

const browser = await chromium.launch()
const ctx = await browser.newContext({
  extraHTTPHeaders: { 'x-vercel-protection-bypass': 'w6XAcwiXyFf9Pea8I6zwVONXAhc8Xs9A' },
  viewport: { width: 1280, height: 900 },
})
const page = await ctx.newPage()

// 1. Login as Lan (buddy)
await page.goto('https://localit-nhattoann.vercel.app/login', { waitUntil: 'domcontentloaded' })
await page.waitForSelector('#email')
await page.fill('#email', 'lan.pham@localit.dev')
await page.fill('#password', 'password123')
await page.click('button[type="submit"]')
await page.waitForURL((u) => !u.toString().includes('/login'), { timeout: 20000 })

await page.goto('https://localit-nhattoann.vercel.app/profile', { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(5000)

await page.locator('button:has-text("Personal info")').first().click().catch(() => {})
await page.waitForTimeout(1000)

const bio = page.locator('#bio')
const before = await bio.inputValue()
console.log('lan profile.bio before:', before.length, 'chars')

// Update profile.bio (Lan's general bio)
const newProfileBio = 'LAN PROFILE BIO ' + Date.now()
await bio.fill(newProfileBio)

const saveBtn = page.locator('button:has-text("Save changes")').first()
await saveBtn.click()
await page.waitForTimeout(4000)
console.log('saved profile.bio')

// 2. Now switch to Linh and view Lan's public profile
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

await page2.goto('https://localit-nhattoann.vercel.app/buddies/11111111-1111-1111-1111-111111111111', { waitUntil: 'domcontentloaded' })
await page2.waitForTimeout(4000)
await page2.screenshot({ path: 'scripts/screenshots/lan-bio-from-linh.png', fullPage: true })

const txt = await page2.evaluate(() => document.body.innerText)
console.log('Linh sees updated Lan bio:', txt.includes('LAN PROFILE BIO'))

await browser.close()
