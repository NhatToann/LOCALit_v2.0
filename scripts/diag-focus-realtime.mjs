// Diag: open a Playwright session as Lan, navigate to /focus/[sessionId],
// then capture all WS frames received. Filter for messages related to
// the focus conversation and look for INSERT events on `messages`.
import { chromium } from 'playwright'
import { Client } from 'pg'

const BASE = 'https://localit-nhattoann.vercel.app'
const BYPASS = 'w6XAcwiXyFf9Pea8I6zwVONXAhc8Xs9A'
const DB_URL = `postgresql://postgres:that1arlecchino@db.pqvnjgyqbxlylawwogjv.supabase.co:5432/postgres`

const main = async () => {
  // Find a focus session and the conversation id
  const db = new Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } })
  await db.connect()
  const lanRow = await db.query(`SELECT id FROM public.profiles WHERE email = 'lan.pham@localit.dev'`)
  const sarahRow = await db.query(`SELECT id FROM public.profiles WHERE email = 'sarah.m@example.com'`)
  const lanId = lanRow.rows[0]?.id
  const sarahId = sarahRow.rows[0]?.id
  const sessRow = await db.query(
    `SELECT id, conversation_id FROM public.focus_sessions
     WHERE (user_a_id = $1 OR user_b_id = $1)
       AND (user_a_id = $2 OR user_b_id = $2)
     ORDER BY started_at DESC LIMIT 1`,
    [lanId, sarahId],
  )
  let sessionId, convId
  if (sessRow.rows.length === 0) {
    // No session — create one directly so we can test realtime.
    const cRow = await db.query(
      `SELECT id FROM public.conversations
       WHERE (tourist_id = $1 AND buddy_id = $2)
          OR (tourist_id = $2 AND buddy_id = $1) LIMIT 1`,
      [sarahId, lanId],
    )
    convId = cRow.rows[0]?.id
    if (!convId) {
      const insC = await db.query(
        `INSERT INTO public.conversations (tourist_id, buddy_id) VALUES ($1, $2) RETURNING id`,
        [sarahId, lanId],
      )
      convId = insC.rows[0].id
    }
    const insS = await db.query(
      `INSERT INTO public.focus_sessions (user_a_id, user_b_id, conversation_id, started_at)
       VALUES ($1, $2, $3, now()) RETURNING id`,
      [lanId, sarahId, convId],
    )
    sessionId = insS.rows[0].id
    console.log('Created focus session:', sessionId)
  } else {
    sessionId = sessRow.rows[0].id
    convId = sessRow.rows[0].conversation_id
  }
  console.log({ sessionId, convId })

  // Insert a "test" message into the conversation that Lan should see via realtime
  const insertRes = await db.query(
    `INSERT INTO public.messages (conversation_id, sender_id, content, message_type)
     VALUES ($1, $2, 'rt-diag-' || extract(epoch from now())::text, 'text')
     RETURNING id, created_at`,
    [convId, sarahId],
  )
  const insertedId = insertRes.rows[0].id
  console.log('Inserted test message:', insertedId)

  // Now have Lan open the focus page; capture WS frames AND console logs.
  const browser = await chromium.launch()
  const ctx = await browser.newContext({
    extraHTTPHeaders: { 'x-vercel-protection-bypass': BYPASS },
  })
  const page = await ctx.newPage()
  // Capture WS frames.
  const frames = []
  page.on('websocket', (ws) => {
    ws.on('framereceived', (data) => {
      const s = data.payload.toString()
      if (s.includes('postgres_changes') || s.includes('conv-') || s.includes('INSERT')) {
        frames.push({ t: Date.now(), snippet: s.slice(0, 400) })
      }
    })
  })
  // Capture console logs
  const logs = []
  page.on('console', (msg) => {
    const text = msg.text()
    if (msg.type() === 'log' || msg.type() === 'warning' || msg.type() === 'error' || text.includes('dlog') || text.includes('useMessageStream')) {
      logs.push(`[${msg.type()}] ${text}`)
    }
  })
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`))
  // Login as Lan
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
  await page.fill('input#email', 'lan.pham@localit.dev')
  await page.fill('input#password', 'password123')
  await Promise.all([
    page.waitForURL('**/dashboard', { timeout: 20000 }),
    page.click('button:has-text("Sign in")'),
  ])
  await page.goto(`${BASE}/focus/${sessionId}`, { waitUntil: 'domcontentloaded' })
  // Wait 5s for subscriptions to set up
  await page.waitForTimeout(5000)

  // Now insert ANOTHER test message
  const insertRes2 = await db.query(
    `INSERT INTO public.messages (conversation_id, sender_id, content, message_type)
     VALUES ($1, $2, 'rt-diag2-' || extract(epoch from now())::text, 'text')
     RETURNING id`,
    [convId, sarahId],
  )
  console.log('Inserted test message 2:', insertRes2.rows[0].id)

  // Wait for delivery
  await page.waitForTimeout(8000)

  // Check if message is in DOM
  const visible = await page.locator('text=rt-diag2-').count()
  console.log('DOM count for rt-diag2:', visible)
  // Also try the rt-diag- (no 2)
  const visible1 = await page.locator('text=rt-diag-').count()
  console.log('DOM count for rt-diag- (any):', visible1)
  console.log('Total captured frames:', frames.length)
  // Inspect what's actually in the page
  const info = await page.evaluate(async () => {
    // Try fetching messages via supabase client
    const url = 'https://pqvnjgyqbxlylawwogjv.supabase.co'
    const key = 'sb_publishable_3uRUZqdvazd4cENt8WOWJA_SB7HmCEE'
    const sess = await fetch(url + '/auth/v1/user', {
      headers: { apikey: key, authorization: 'Bearer ' + key },
    }).then((r) => r.json())
    return { sess, url: location.href, hasFocusText: document.body.textContent?.includes('Focus with') }
  })
  console.log('page info:', info)
  // Save the chat area HTML
  const chatHtml = await page.evaluate(() => {
    const el = document.querySelector('[aria-live="polite"]')
    return el ? el.outerHTML : 'NOT FOUND'
  })
  console.log('--- chat aria-live region ---')
  console.log(chatHtml.slice(0, 2000))
  console.log('--- end chat ---')
  console.log('--- console logs ---')
  for (const l of logs) console.log(l)
  console.log('--- end logs ---')
  // Also query the React state if possible
  const state = await page.evaluate(() => {
    const root = document.querySelector('main')
    return { html: root ? root.innerHTML.length : 0, hasBubble: !!document.querySelector('[data-message-id]') }
  })
  console.log('state:', state)
  await browser.close()
  await db.end()
}
main().catch((e) => {
  console.error(e)
  process.exit(2)
})
