// Two-browser test: Lan and Phan in the same conversation.
// Sends a message from one, verifies it appears for the other via realtime.
import { chromium } from 'playwright'

const BASE = 'https://localit-nhattoann.vercel.app'
const CONV = '8c48a631-f230-4622-8c66-5cb1c27e46e7'

const LAN = { email: 'lan.pham@localit.dev', password: 'password123' }
const PHAN = { email: 'darklunatv@gmail.com', password: 'password123' }

const main = async () => {
  const browser = await chromium.launch({ headless: true })
  const ctxA = await browser.newContext()
  const ctxB = await browser.newContext()
  const lan = await ctxA.newPage()
  const phan = await ctxB.newPage()

  const login = async (page, cred, label) => {
    await page.goto(`${BASE}/login?switch=1`, { waitUntil: 'networkidle' })
    await page.waitForSelector('input[type="email"]', { timeout: 20000 })
    await page.waitForTimeout(500)
    const inputs = await page.evaluate(() =>
      [...document.querySelectorAll('input')].map(i => ({ type: i.type, name: i.name, id: i.id, ph: i.placeholder })),
    )
    console.log(`  [${label}] inputs:`, JSON.stringify(inputs))
    await page.fill('#email', cred.email)
    await page.fill('#password', cred.password)
    await page.click('button[type="submit"]')
    await page.waitForURL(/dashboard/, { timeout: 30000 })
    console.log(`  ${label} logged in`)
  }

  const openConv = async (page, label) => {
    await page.goto(`${BASE}/chat?c=${CONV}`, { waitUntil: 'networkidle' })
    await page.waitForTimeout(3500)
    const txt = await page.evaluate(() => document.body.innerText)
    const hasEmpty = txt.includes('Chưa có tin nhắn nào') || txt.includes('Say hi to')
    console.log(`  ${label}: empty-state=${hasEmpty}`)
    return { hasEmpty, txt }
  }

  console.log('=== logging in ===')
  await login(lan, LAN, 'Lan')
  await login(phan, PHAN, 'Phan')

  console.log('\n=== opening conversation ===')
  const a = await openConv(lan, 'Lan')
  const b = await openConv(phan, 'Phan')

  // Count rendered bubbles in the scroll container
  const countBubbles = async (page) => page.evaluate(() => {
    const el = document.querySelector('[aria-live="polite"]')
    if (!el) return -1
    return el.querySelectorAll('[data-message-id], .group').length || el.children.length
  })
  console.log('  Lan rendered bubbles :', await countBubbles(lan))
  console.log('  Phan rendered bubbles:', await countBubbles(phan))

  console.log('\n=== realtime: Lan sends ===')
  const stamp = 'realtime-test-' + Date.now()
  await lan.fill('textarea, input[placeholder*="message" i]', stamp)
  await lan.keyboard.press('Enter')
  await lan.waitForTimeout(3000)

  const lanSees = await lan.evaluate(() => document.body.innerText.includes('realtime-test-'))
  const phanSees = await phan.evaluate(() => document.body.innerText.includes('realtime-test-'))
  console.log(`  Lan sees own msg: ${lanSees}`)
  console.log(`  Phan sees msg via realtime: ${phanSees}`)

  if (!phanSees) {
    // Did Phan get it after a reload?
    await phan.reload({ waitUntil: 'networkidle' })
    await phan.waitForTimeout(2500)
    const afterReload = await phan.evaluate(() => document.body.innerText.includes('realtime-test-'))
    console.log(`  Phan sees msg after reload: ${afterReload}`)
  }

  await browser.close()
  process.exit(phanSees ? 0 : 1)
}

main().catch(e => { console.error(e); process.exit(1) })