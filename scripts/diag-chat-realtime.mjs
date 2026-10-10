// Compare the realtime delivery to the /chat page (known working) vs
// the /focus page (alleged broken). Both should receive the postgres_changes
// event; both should render the new message. Capture the DOM state and
// the rendered text on each side.
import { chromium } from 'playwright'
import { Client } from 'pg'

const BASE = 'https://localit-nhattoann.vercel.app'
const BYPASS = 'w6XAcwiXyFf9Pea8I6zwVONXAhc8Xs9A'
const DB_URL = `postgresql://postgres:that1arlecchino@db.pqvnjgyqbxlylawwogjv.supabase.co:5432/postgres`

const main = async () => {
  const db = new Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } })
  await db.connect()
  const lanId = (await db.query(`SELECT id FROM public.profiles WHERE email = 'lan.pham@localit.dev'`)).rows[0]?.id
  const sarahId = (await db.query(`SELECT id FROM public.profiles WHERE email = 'sarah.m@example.com'`)).rows[0]?.id
  const cRow = await db.query(
    `SELECT id FROM public.conversations
     WHERE (tourist_id = $1 AND buddy_id = $2) OR (tourist_id = $2 AND buddy_id = $1) LIMIT 1`,
    [sarahId, lanId],
  )
  const convId = cRow.rows[0]?.id
  if (!convId) { console.log('no conv'); return }
  await db.end()

  const browser = await chromium.launch()
  const ctx = await browser.newContext({ extraHTTPHeaders: { 'x-vercel-protection-bypass': BYPASS } })
  const page = await ctx.newPage()
  // Login as Lan
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
  await page.fill('input#email', 'lan.pham@localit.dev')
  await page.fill('input#password', 'password123')
  await Promise.all([
    page.waitForURL('**/dashboard', { timeout: 20000 }),
    page.click('button:has-text("Sign in")'),
  ])
  // Go to chat page, click the conversation
  await page.goto(`${BASE}/chat`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2000)
  // Look for Sarah's conversation and click it
  const clicked = await page.evaluate((sarah) => {
    const els = Array.from(document.querySelectorAll('a, button, [role="button"]'))
    const el = els.find((e) => e.textContent && e.textContent.includes('Sarah'))
    if (el) { (el).click(); return true }
    return false
  }, 'Sarah')
  console.log('clicked Sarah in chat list:', clicked)
  await page.waitForTimeout(3000)

  // Now insert a message via DB
  const db2 = new Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } })
  await db2.connect()
  const r = await db2.query(
    `INSERT INTO public.messages (conversation_id, sender_id, content, message_type)
     VALUES ($1, $2, 'chatpage-diag-' || extract(epoch from now())::text, 'text')
     RETURNING id, content`,
    [convId, sarahId],
  )
  console.log('Inserted:', r.rows[0])
  await db2.end()
  // Wait
  await page.waitForTimeout(8000)
  const visible = await page.locator('text=chatpage-diag-').count()
  console.log('Chat page DOM count for chatpage-diag:', visible)
  await browser.close()
}
main().catch((e) => { console.error(e); process.exit(2) })
