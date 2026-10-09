// test-buddy-bio-propagation.mjs
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
console.log('[smoke] lan logged in')

await page.goto('https://localit-nhattoann.vercel.app/profile', { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(3000)
// Scroll to bottom to ensure buddyBio is rendered
await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
await page.waitForTimeout(1000)

// Look for buddy-specific bio (id="buddyBio")
await page.locator('textarea#buddyBio').waitFor({ state: 'attached', timeout: 10000 })
const buddyBio = page.locator('textarea#buddyBio')
const cnt = await buddyBio.count()
console.log('[smoke] buddyBio count:', cnt)

if (cnt > 0) {
  const before = await buddyBio.inputValue()
  console.log('[smoke] current buddy bio length:', before.length)
  const newBio = 'BUDDY PROPAGATION TEST ' + Date.now()
  await buddyBio.fill(newBio)

  // Scroll into view and click save
  await buddyBio.scrollIntoViewIfNeeded()
  await page.waitForTimeout(500)
  const saveBtn = page.locator('button:has-text("Save changes")')
  const saveCnt = await saveBtn.count()
  console.log('[smoke] save buttons:', saveCnt)
  if (saveCnt > 0) {
    await saveBtn.first().click()
    await page.waitForTimeout(4000)
    console.log('[smoke] saved')
  }
}

await page.screenshot({ path: 'scripts/screenshots/edit-lan-buddy-bio.png', fullPage: true })

// Now switch to John
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
console.log('[smoke] john logged in')

await page2.goto('https://localit-nhattoann.vercel.app/buddies/11111111-1111-1111-1111-111111111111', { waitUntil: 'domcontentloaded' })
await page2.waitForTimeout(3000)
await page2.screenshot({ path: 'scripts/screenshots/edit-lan-buddy-from-john.png', fullPage: true })

const txt = await page2.evaluate(() => document.body.innerText)
console.log('[smoke] has BUDDY PROPAGATION TEST:', txt.includes('BUDDY PROPAGATION TEST'))

await browser.close()
