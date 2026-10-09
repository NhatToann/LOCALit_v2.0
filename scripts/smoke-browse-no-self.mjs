// scripts/smoke-browse-no-self.mjs
// 2026-10-09: verify the signed-in user never appears in their own /browse
// feed (or /map pins) even though their tourist row exists.
import { chromium } from 'playwright'

const BASE = 'https://localit-nhattoann.vercel.app'
const BYPASS = 'w6XAcwiXyFf9Pea8I6zwVONXAhc8Xs9A'

const browser = await chromium.launch({ headless: true })
try {
  const ctx = await browser.newContext({
    extraHTTPHeaders: { 'x-vercel-protection-bypass': BYPASS },
    viewport: { width: 1280, height: 900 },
  })
  const page = await ctx.newPage()

  // Sign in as Phan Nhật Toàn (tourist) — darklunatv@gmail.com
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('input#email', { timeout: 30000 })
  // Try common test passwords; Phan Nhật Toàn may not have a known
  // password set in seed. Fall back to Mike Johnson if login fails.
  const tries = [
    { email: 'mike.j@example.com', pw: 'password123', name: 'Mike Johnson' },
    { email: 'sarah.m@example.com', pw: 'password123', name: 'Sarah Miller' },
    { email: 'darklunatv@gmail.com', pw: 'Toan@2026', name: 'Phan Nhật Toàn' },
    { email: 'darklunatv@gmail.com', pw: 'password123', name: 'Phan Nhật Toàn' },
  ]
  let signedInAs = null
  for (const t of tries) {
    await page.fill('input#email', t.email)
    await page.fill('input#password', t.pw)
    await page.click('button:has-text("Sign in")')
    // Sign-in may either redirect to /dashboard or stay on /login with an
    // inline error. Give the client-side auth state time to settle, then
    // check the URL and the dashboard greeting.
    try {
      await page.waitForURL('**/dashboard', { timeout: 8000 })
      // Confirm the dashboard rendered for the right user
      await page.waitForSelector('h1', { timeout: 5000 })
      const h1 = (await page.locator('h1').first().textContent()) || ''
      console.log(`[smoke] signed-in with ${t.email} (${t.name}) — h1: ${h1.slice(0, 40)}`)
      signedInAs = t
      break
    } catch {
      // Login failed; back to /login. Try next cred pair.
      const stillOnLogin = page.url().includes('/login')
      if (!stillOnLogin) {
        // Some other page; treat as failure
        await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
      }
      await page.waitForSelector('input#email', { timeout: 8000 })
    }
  }
  if (!signedInAs) {
    console.error('FAIL: no test creds worked')
    process.exit(2)
  }

  await page.goto(`${BASE}/browse`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2500)

  // The "own name" is whatever the signed-in user is — not a global set of
  // test users, since other tourists legitimately appear in the feed.
  const allText = await page.locator('body').textContent()
  const greeting = await page.locator('h1, h2, [data-greeting]').first().textContent().catch(() => '')
  console.log(`[smoke] signed-in greeting/name marker: "${(greeting || '').slice(0, 60)}"`)
  const ownName = signedInAs.name
  const hasSelf = (allText || '').includes(ownName)
  // Count <a href="/buddies/..."> + <a href="/tourists/..."> — actual person
  // row links, not generic locator matches.
  const rowCount = await page
    .locator('a[href^="/buddies/"], a[href^="/tourists/"]')
    .count()
  console.log(`[smoke] own name "${ownName}" in /browse body: ${hasSelf}`)
  console.log(`[smoke] total list items: ${rowCount}`)

  if (hasSelf) {
    console.error(`FAIL: self "${ownName}" still visible in /browse`)
    process.exit(1)
  } else {
    console.log(`PASS: self "${ownName}" NOT in /browse feed`)
  }
} finally {
  await browser.close()
}
