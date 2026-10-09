import { chromium } from 'playwright'

const browser = await chromium.launch()
const ctx = await browser.newContext({
  extraHTTPHeaders: { 'x-vercel-protection-bypass': 'w6XAcwiXyFf9Pea8I6zwVONXAhc8Xs9A' },
  viewport: { width: 1280, height: 900 },
})
const page = await ctx.newPage()

// 1. Login as Linh
await page.goto('https://localit-nhattoann.vercel.app/login', { waitUntil: 'domcontentloaded' })
await page.waitForSelector('#email')
await page.fill('#email', 'linh.tran@localit.dev')
await page.fill('#password', 'password123')
await page.click('button[type="submit"]')
await page.waitForURL((u) => !u.toString().includes('/login'), { timeout: 20000 })

await page.goto('https://localit-nhattoann.vercel.app/profile', { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(6000)

// Click on tab "Expertise & pricing" to find buddy bio
await page.locator('button:has-text("Expertise & pricing")').first().click()
await page.waitForTimeout(1500)

const buddyBio = page.locator('#buddyBio')
const hasBuddyBio = await buddyBio.count()
console.log('buddyBio count:', hasBuddyBio)

if (hasBuddyBio > 0) {
  const before = await buddyBio.inputValue()
  console.log('current buddy bio length:', before.length)

  const newBio = 'BUDDY BIO PROPAGATION ' + Date.now()
  await buddyBio.fill(newBio)

  // Click "Save changes" inside the active tab
  const saveBtn = page.locator('button:has-text("Save changes")').first()
  await saveBtn.click()
  await page.waitForTimeout(4000)
  console.log('saved')

  await page.screenshot({ path: 'scripts/screenshots/edit-linh-after.png', fullPage: true })
}

// 2. Switch to another user (John) to verify
await page.context().clearCookies()
const ctx2 = await browser.newContext({
  extraHTTPHeaders: { 'x-vercel-protection-bypass': 'w6XAcwiXyFf9Pea8I6zwVONXAhc8Xs9A' },
  viewport: { width: 1280, height: 900 },
})
const page2 = await ctx2.newPage()
await page2.goto('https://localit-nhattoann.vercel.app/login', { waitUntil: 'domcontentloaded' })
await page2.waitForSelector('#email')
await page2.fill('#email', 'john.doe@example.com')
await page2.fill('#password', 'password123')
await page2.click('button[type="submit"]')
await page2.waitForURL((u) => !u.toString().includes('/login'), { timeout: 20000 })

await page2.goto('https://localit-nhattoann.vercel.app/buddies/44444444-4444-4444-4444-444444444444', { waitUntil: 'domcontentloaded' })
await page2.waitForTimeout(4000)
await page2.screenshot({ path: 'scripts/screenshots/edit-linh-from-john.png', fullPage: true })

const txt = await page2.evaluate(() => document.body.innerText)
const hasNewBio = txt.includes('BUDDY BIO PROPAGATION')
console.log('John sees updated bio:', hasNewBio)

await browser.close()
