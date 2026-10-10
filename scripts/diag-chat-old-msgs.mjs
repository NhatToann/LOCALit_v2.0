// Verify if /chat page shows old messages from DB
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
  // Check current message count
  const c = await db.query(`SELECT COUNT(*) FROM public.messages WHERE conversation_id = $1`, [convId])
  console.log('Current message count:', c.rows[0].count)
  await db.end()

  const browser = await chromium.launch()
  const ctx = await browser.newContext({ extraHTTPHeaders: { 'x-vercel-protection-bypass': BYPASS } })
  const page = await ctx.newPage()
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
  await page.fill('input#email', 'lan.pham@localit.dev')
  await page.fill('input#password', 'password123')
  await Promise.all([
    page.waitForURL('**/dashboard', { timeout: 20000 }),
    page.click('button:has-text("Sign in")'),
  ])
  await page.goto(`${BASE}/chat`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(3000)
  // Click the Sarah conversation (find by name)
  const clicked = await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll('a, button, li, div'))
    const el = els.find((e) => {
      const t = e.textContent || ''
      return t.includes('Sarah') && t.length < 100
    })
    if (el) { el.click(); return true }
    return false
  })
  console.log('clicked Sarah:', clicked)
  await page.waitForTimeout(5000)
  // Count message bubbles in chat thread
  const bubbleCount = await page.evaluate(() => {
    // Look for the chat thread
    const main = document.getElementById('main-content')
    return {
      mainHtml: main ? main.innerHTML.length : 0,
      mainText: main ? main.textContent?.slice(0, 2000) : null,
    }
  })
  console.log('chat main content:', JSON.stringify(bubbleCount, null, 2))
  // Get full text
  const text = await page.locator('main').textContent()
  const textHas = text?.includes('rt-diag2-')
  console.log('text contains rt-diag2:', textHas)
  if (text) {
    const lines = text.split('\n').filter((l) => l.includes('rt-diag') || l.includes('chatpage-diag') || l.includes('Xin ch'))
    console.log('matching lines:', lines.slice(0, 5))
  }
  await browser.close()
}
main().catch((e) => { console.error(e); process.exit(2) })
