// Test realtime sync between 2 users
import { chromium } from 'playwright'

const BASE = 'https://localit-nhattoann.vercel.app'
const BYPASS = 'w6XAcwiXyFf9Pea8I6zwVONXAhc8Xs9A'

const CONV_ID = '8c48a631-f230-4622-8c66-5cb1c27e46e7' // Phan Nhật Toàn ↔ Lan Pham

async function getAuthCookie(email, password) {
  const browser = await chromium.launch()
  const ctx = await browser.newContext({
    extraHTTPHeaders: { 'x-vercel-protection-bypass': BYPASS },
  })
  const page = await ctx.newPage()
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
  await page.fill('input#email', email)
  await page.fill('input#password', password)
  await Promise.all([
    page.waitForURL('**/dashboard', { timeout: 20000 }),
    page.click('button:has-text("Sign in")'),
  ])
  const cookies = await ctx.cookies()
  await browser.close()
  return cookies
}

const main = async () => {
  // Use seed accounts that work with the password
  // Phan Nhật Toàn doesn't have password123 — use a token-based login
  // Actually let's just use Phan via cookie and Lan via the API

  // 1) Phan signs in (real email, use bypass + cookies)
  console.log('Logging in Phan Nhật Toàn...')
  const browser = await chromium.launch()
  const ctxP = await browser.newContext({
    extraHTTPHeaders: { 'x-vercel-protection-bypass': BYPASS },
  })
  const p = await ctxP.newPage()
  p.on('console', (msg) => {
    if (msg.type() === 'error') console.log(`[Phan console error] ${msg.text()}`)
  })
  p.on('pageerror', (err) => console.log(`[Phan pageerror] ${err.message}`))
  await p.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
  await p.fill('input#email', 'darklunatv@gmail.com')
  await p.fill('input#password', 'password123')
  await Promise.all([
    p.waitForURL('**/dashboard', { timeout: 20000 }),
    p.click('button:has-text("Sign in")'),
  ]).catch(e => console.log('Phan login failed:', e.message))
  console.log('Phan URL:', p.url())

  // 2) Lan signs in
  console.log('Logging in Lan Pham...')
  const ctxL = await browser.newContext({
    extraHTTPHeaders: { 'x-vercel-protection-bypass': BYPASS },
  })
  const l = await ctxL.newPage()
  l.on('console', (msg) => {
    if (msg.type() === 'error') console.log(`[Lan console error] ${msg.text()}`)
  })
  l.on('pageerror', (err) => console.log(`[Lan pageerror] ${err.message}`))
  await l.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
  await l.fill('input#email', 'lan.pham@localit.dev')
  await l.fill('input#password', 'password123')
  await Promise.all([
    l.waitForURL('**/dashboard', { timeout: 20000 }),
    l.click('button:has-text("Sign in")'),
  ])
  console.log('Lan URL:', l.url())

  // 3) Both navigate to /chat with the conv param
  console.log(`Both opening conv ${CONV_ID}...`)
  await p.goto(`${BASE}/chat?c=${CONV_ID}`, { waitUntil: 'domcontentloaded' })
  await l.goto(`${BASE}/chat?c=${CONV_ID}`, { waitUntil: 'domcontentloaded' })
  await p.waitForTimeout(3000)
  await l.waitForTimeout(3000)

  // 4) Phan sends a unique message
  const testMsg = `TEST_SYNC_${Date.now()}_FROM_PHAN`
  console.log(`Phan sending: ${testMsg}`)
  await p.fill('textarea[aria-label="Message draft"]', testMsg)
  await p.click('button[aria-label="Send message"]')

  // 5) Wait + check if Lan sees it
  console.log('Waiting 5s for realtime fan-out...')
  await l.waitForTimeout(5000)

  // Check Lan's view for the message
  const lanSawIt = await l.locator(`text=${testMsg}`).count()
  const phanSawIt = await p.locator(`text=${testMsg}`).count()
  console.log(`Phan sees own message: ${phanSawIt > 0}`)
  console.log(`Lan sees Phan's message: ${lanSawIt > 0}`)

  // Screenshot
  await l.screenshot({ path: 'scripts/screenshots/sync-test-lan.png' })
  await p.screenshot({ path: 'scripts/screenshots/sync-test-phan.png' })

  // Check the websocket state
  const wsState = await l.evaluate(() => {
    const ws = []
    performance.getEntries().forEach(e => {
      if (e.name && e.name.includes('realtime')) ws.push(e.name)
    })
    return ws
  })
  console.log('WS on Lan:', wsState)

  await browser.close()
  process.exit(lanSawIt > 0 ? 0 : 1)
}

main().catch(e => { console.error(e); process.exit(2) })
