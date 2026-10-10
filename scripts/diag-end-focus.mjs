// Direct test: end a focus session via API
import { chromium } from 'playwright'
import { Client } from 'pg'

const BASE = 'https://localit-nhattoann.vercel.app'
const BYPASS = 'w6XAcwiXyFf9Pea8I6zwVONXAhc8Xs9A'
const DB_URL = `postgresql://postgres:that1arlecchino@db.pqvnjgyqbxlylawwogjv.supabase.co:5432/postgres`

const main = async () => {
  const db = new Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } })
  await db.connect()
  // Create a fresh session
  const lanId = (await db.query(`SELECT id FROM public.profiles WHERE email = 'lan.pham@localit.dev'`)).rows[0]?.id
  const sarahId = (await db.query(`SELECT id FROM public.profiles WHERE email = 'sarah.m@example.com'`)).rows[0]?.id
  const cRow = await db.query(
    `SELECT id FROM public.conversations WHERE (tourist_id = $1 AND buddy_id = $2) OR (tourist_id = $2 AND buddy_id = $1) LIMIT 1`,
    [sarahId, lanId],
  )
  const convId = cRow.rows[0]?.id
  const insS = await db.query(
    `INSERT INTO public.focus_sessions (user_a_id, user_b_id, conversation_id, started_at)
     VALUES ($1, $2, $3, now()) RETURNING id`,
    [lanId, sarahId, convId],
  )
  const sessionId = insS.rows[0].id
  console.log('Created session:', sessionId)
  await db.end()

  // Login as Sarah
  const browser = await chromium.launch()
  const ctx = await browser.newContext({ extraHTTPHeaders: { 'x-vercel-protection-bypass': BYPASS } })
  const page = await ctx.newPage()
  page.on('console', (msg) => {
    if (msg.type() === 'error') console.log('[console.error]', msg.text())
  })
  page.on('pageerror', (e) => console.log('[pageerror]', e.message))
  page.on('dialog', async (d) => {
    console.log('[dialog]', d.type(), d.message())
    await d.accept()
  })
  page.on('request', (req) => {
    if (req.url().includes('/api/focus/') && req.method() === 'POST') {
      console.log('[request]', req.method(), req.url())
    }
  })
  page.on('response', (res) => {
    if (res.url().includes('/api/focus/')) {
      console.log('[response]', res.status(), res.url())
    }
  })
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
  await page.fill('input#email', 'sarah.m@example.com')
  await page.fill('input#password', 'password123')
  await Promise.all([
    page.waitForURL('**/dashboard', { timeout: 20000 }),
    page.click('button:has-text("Sign in")'),
  ])
  await page.goto(`${BASE}/focus/${sessionId}`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(3000)
  console.log('Clicking End Focus...')
  await page.click('button:has-text("End Focus")')
  await page.waitForTimeout(8000)
  console.log('URL after click:', page.url())
  // Get any error displayed
  const err = await page.locator('[role="alert"]').textContent().catch(() => null)
  console.log('Error text:', err)
  // Get button text
  const btn = await page.locator('button:has-text("End")').textContent().catch(() => null)
  console.log('Button text:', btn)
  await browser.close()
}
main().catch((e) => { console.error(e); process.exit(2) })
