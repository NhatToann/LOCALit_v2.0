// End-to-end verification of the notification respond flow as a real
// user: buddy signs in, opens the bell, taps the connection request,
// lands on the profile, and accepts.
import { chromium } from 'playwright'
import { Client } from 'pg'

const ORIGIN = 'https://localit-vn.vercel.app'
const TOURIST = { email: 'darklunatv@gmail.com', name: 'Phan Nhật Toàn', id: 'f2df98b0-96cf-451d-9d85-5060ddc1ca01' }
const BUDDY = { email: 'lan.pham@localit.dev', name: 'Lan Pham', id: '11111111-1111-1111-1111-111111111111' }
const PW = 'password123'

let passed = 0, failed = 0
const ok = (label, cond, extra = '') => {
  if (cond) { passed++; console.log(`  PASS  ${label}`) }
  else { failed++; console.log(`  FAIL  ${label}  ${extra}`) }
}

const pg = new Client({
  host: 'db.pqvnjgyqbxlylawwogjv.supabase.co',
  port: 5432,
  user: 'postgres',
  password: process.env.DB_PW || process.env.SUPABASE_DB_PASSWORD || 'that1arlecchino',
  database: 'postgres',
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 15000,
})
const db = async (sql, params = []) => (await pg.query(sql, params)).rows
await pg.connect()

const browser = await chromium.launch()
const hardStop = setTimeout(() => { console.error('\n  HARD TIMEOUT'); process.exit(1) }, 240000)

async function login(page, who) {
  await page.goto(`${ORIGIN}/login?switch=1`, { waitUntil: 'domcontentloaded' })
  await page.fill('input[type="email"]', who.email)
  await page.fill('input[type="password"]', PW)
  await page.click('button[type="submit"]')
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 25000 })
  await page.waitForTimeout(1500)
}

const connectState = (page) =>
  page.evaluate(() => {
    const btns = [...document.querySelectorAll('button, a')]
    return {
      spinner: !!document.querySelector('[data-connect-state="loading"]'),
      accept: btns.filter((b) => b.textContent.trim() === 'Accept').length,
      decline: btns.filter((b) => b.textContent.trim() === 'Decline').length,
      connectWith: btns.filter((b) => b.textContent.includes('Connect with')).length,
      connected: btns.filter((b) => b.textContent.includes('Open chat')).length,
      alerts: [...document.querySelectorAll('[role="alert"]')].map((e) => e.textContent.trim()),
      srOnly: [...document.querySelectorAll('.sr-only')].map((e) => e.textContent.trim()).filter((t) => /connection status/i.test(t)),
    }
  })

try {
  console.log('\n=== SETUP: tourist sends a fresh request to the buddy ===')
  await db(`DELETE FROM public.notifications WHERE user_id = $1 AND type = 'connection_request'`, [BUDDY.id])
  await db(`DELETE FROM public.connections WHERE tourist_id = $1 AND buddy_id = $2`, [TOURIST.id, BUDDY.id])
  await db(
    `INSERT INTO public.connections (tourist_id, buddy_id, requester_id, recipient_id, requester_role, recipient_role, status, message, created_at)
     VALUES ($1,$2,$1,$2,'tourist','buddy','pending',$3, now())`,
    [TOURIST.id, BUDDY.id, 'E2E: testing the notification respond flow'],
  )
  await new Promise((r) => setTimeout(r, 1500))

  const [notif] = await db(
    `SELECT id, link FROM public.notifications WHERE user_id = $1 AND type = 'connection_request' ORDER BY created_at DESC LIMIT 1`,
    [BUDDY.id],
  )
  ok('buddy received the connection_request notification', !!notif)
  ok('link follows the actor role', notif?.link === `/tourists/${TOURIST.id}`, `got ${notif?.link}`)

  console.log('\n=== END USER: buddy taps the notification ===')
  const page = await (await browser.newContext()).newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))

  await login(page, BUDDY)
  ok('signed in off /login', !page.url().includes('/login'), page.url())

  const bell = page.locator('button[aria-label*="otification"]').first()
  ok('bell is in the header', (await bell.count()) > 0)
  await bell.click()
  await page.waitForTimeout(1500)

  const panel = page.locator('#notification-panel')
  ok('popover opened', (await panel.count()) > 0)

  const row = page.locator(`#notification-panel button:has-text("wants to connect")`).first()
  ok('request row visible in the popover', (await row.count()) > 0)

  const before = page.url()
  await row.click()
  // Navigation must complete quickly — the read receipt is fire-and-forget.
  let navigated = false
  try {
    await page.waitForURL((u) => u.href !== before, { timeout: 8000 })
    navigated = true
  } catch { /* stays on the page */ }
  await page.waitForTimeout(1500)

  ok('tapping the notification navigated', navigated, `still ${page.url()}`)
  ok('landed on the tourist profile', page.url().includes(`/tourists/${TOURIST.id}`), page.url())
  ok('no 404 page', (await page.locator('text=Page not found').count()) === 0)
  ok('notification was marked read', (await db(
    `SELECT read_at FROM public.notifications WHERE id = $1`, [notif.id]))[0]?.read_at !== null)

  console.log('\n=== END USER: Accept / Decline are actionable ===')
  // Wait up to 15s for the button to leave its loading state.
  let st = await connectState(page)
  for (let i = 0; i < 15 && st.spinner; i++) {
    await page.waitForTimeout(1000)
    st = await connectState(page)
  }
  console.log('  state:', JSON.stringify(st))
  ok('button is no longer stuck on a spinner', !st.spinner)
  ok('Accept is clickable', st.accept === 1, JSON.stringify(st))
  ok('Decline is clickable', st.decline === 1, JSON.stringify(st))

  if (st.accept === 1) {
    await page.locator('button:text-is("Accept")').first().click()
    await page.waitForTimeout(3000)
    const [conn] = await db(
      `SELECT status::text, accepted_at FROM public.connections WHERE tourist_id = $1 AND buddy_id = $2`,
      [TOURIST.id, BUDDY.id],
    )
    ok('Accept persisted status=accepted', conn?.status === 'accepted', JSON.stringify(conn))
    ok('accepted_at is set', !!conn?.accepted_at)
    const after = await connectState(page)
    ok('UI switched to Connected', after.connected === 1, JSON.stringify(after))
  }

  const real = errors.filter((e) => !/favicon|Not Found|Failed to load resource/i.test(e))
  ok('no unexpected page errors', real.length === 0, real.slice(0, 2).join(' | '))

  await page.screenshot({ path: 'scripts/screenshots/e2e-notification-respond.png', fullPage: false })
} catch (e) {
  failed++
  console.error('\n  ERROR:', e.message)
} finally {
  await browser.close()
  await pg.end()
}

console.log(`\n${passed} passed, ${failed} failed`)
clearTimeout(hardStop)
process.exit(failed > 0 ? 1 : 0)