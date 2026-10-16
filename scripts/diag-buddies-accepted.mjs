// Standalone check: open /buddies/lan AFTER manually creating an
// accepted connection, dump the rendered buttons.
import { chromium } from 'playwright'
import { Client } from 'pg'

const PROD = 'https://localit-nhattoann.vercel.app'
const BYPASS = process.env.VERCEL_BYPASS ?? ''
const LAN = 'lan.pham@localit.dev'
const LAN_PW = 'password123'
const TOAN_PW = 'Test1234!'
const LAN_ID = '11111111-1111-1111-1111-111111111111'
const TOAN_ID = 'f2df98b0-96cf-451d-9d85-5060ddc1ca01'

// 1) Manually create an accepted connection Toan → Lan
const c = new Client({
  connectionString:
    'postgresql://postgres:that1arlecchino@db.pqvnjgyqbxlylawwogjv.supabase.co:5432/postgres',
  ssl: { rejectUnauthorized: false },
})
await c.connect()
await c.query(
  `DELETE FROM public.connections
    WHERE (requester_id = $1 AND recipient_id = $2)
       OR (requester_id = $2 AND recipient_id = $1)`,
  [TOAN_ID, LAN_ID],
)
const r = await c.query(
  `INSERT INTO public.connections (requester_id, recipient_id, requester_role, recipient_role, status, duration_days, accepted_at, expires_at)
   VALUES ($1, $2, 'tourist', 'buddy', 'accepted', 7, now(), now() + interval '7 days')
   RETURNING id`,
  [TOAN_ID, LAN_ID],
)
console.log('inserted connection', r.rows[0].id)
await c.end()

// 2) Browser: sign in as Toan, open Lan's profile
const browser = await chromium.launch({ headless: true })
const ctx = await browser.newContext({
  extraHTTPHeaders: BYPASS ? { 'x-vercel-protection-bypass': BYPASS } : {},
})
const page = await ctx.newPage()

page.on('console', (m) => {
  if (['error', 'warning'].includes(m.type())) {
    console.log(`[${m.type()}]`, m.text().slice(0, 200))
  }
})
page.on('pageerror', (e) => console.log('[pageerror]', e.message))

await page.goto(`${PROD}/login`, { waitUntil: 'domcontentloaded' })
await page.fill('input[type="email"]', 'darklunatv@gmail.com')
await page.fill('input[type="password"]', TOAN_PW)
await page.click('button[type="submit"]')
await page.waitForURL((u) => !u.toString().includes('/login'), { timeout: 30_000 })

await page.goto(`${PROD}/buddies/${LAN_ID}`, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(5000)

const buttons = await page.locator('button').allTextContents()
const links = await page.locator('a').allTextContents()
console.log('\nBUTTONS:', buttons.filter((b) => b.trim()))
console.log('\nLINKS (first 20):', links.filter((l) => l.trim()).slice(0, 20))

// Check the connection state API directly
const stateJson = await page.evaluate(async (targetId) => {
  const r = await fetch(`/api/connections/check?target=${targetId}`, { credentials: 'include' })
  return await r.json()
}, LAN_ID)
console.log('\n[api/connections/check] response:', JSON.stringify(stateJson, null, 2))

await page.screenshot({ path: 'scripts/screenshots/diag-buddies-accepted.png', fullPage: true })

await browser.close()
