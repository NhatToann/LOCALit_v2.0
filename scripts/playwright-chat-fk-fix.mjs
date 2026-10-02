// scripts/playwright-chat-fk-fix.mjs
//
// E2E test: as a buddy (Lan), open /chat?buddy=<john's id> and verify
// the conversation opens WITHOUT a 23503 FK error.
//
// Previous behavior (pre-fix): the chat page's openConversationWithBuddy()
// always inserted { tourist_id: myId, buddy_id: partnerId } regardless of
// myRole. As Lan trying to chat with John (also a tourist), the FK
// `conversations_tourist_id_fkey` rejected because Lan's profile.id has
// no row in the `tourists` table — it only has one in `buddies`.
//
// Post-fix: the function now branches on myRole. Lan (role=buddy) gets
// inserted as `buddy_id`, John as `tourist_id`, FK satisfied.
import { chromium } from 'playwright'
import { Client } from 'pg'

const SUPABASE_URL = 'https://pqvnjgyqbxlylawwogjv.supabase.co'
const PROD = 'https://localit-nhattoann.vercel.app'

const LAN_EMAIL = 'lan.pham@localit.dev'
const LAN_PASS = 'password123'
const JOHN_ID = 'aaaa1111-1111-1111-1111-111111111111' // tourist John

async function ensureSeed() {
  const pg = new Client({
    connectionString: `postgresql://postgres:${process.env.SUPABASE_DB_PASSWORD}@db.pqvnjgyqbxlylawwogjv.supabase.co:5432/postgres`,
    ssl: { rejectUnauthorized: false },
  })
  await pg.connect()
  // Clean up any leftover test conversation between Lan + John
  await pg.query(
    `DELETE FROM public.conversations WHERE tourist_id = $1 AND buddy_id = $2`,
    [JOHN_ID, '11111111-1111-1111-1111-111111111111'],
  )
  await pg.end()
}

async function check(page, label) {
  const txt = await page.evaluate(() => document.body.innerText)
  if (txt.includes('violates foreign key')) {
    throw new Error(`[${label}] FK error visible on page`)
  }
  if (txt.includes('Could not open conversation')) {
    const m = txt.match(/Could not open conversation: ([^\n]+)/)
    throw new Error(`[${label}] open-conversation error: ${m?.[1] ?? 'unknown'}`)
  }
}

async function run() {
  await ensureSeed()
  const browser = await chromium.launch({ headless: true })
  const ctx = await browser.newContext()
  const page = await ctx.newPage()
  const consoleErrors = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text())
  })
  page.on('pageerror', (e) => consoleErrors.push(String(e)))

  // 1. Log in as Lan (buddy)
  await page.goto(`${PROD}/login`)
  await page.fill('input[type=email]', LAN_EMAIL)
  await page.fill('input[type=password]', LAN_PASS)
  await page.click('button[type=submit]')
  await page.waitForURL(/\/dashboard/, { timeout: 15_000 })
  console.log('[login] OK as Lan (buddy)')

  // 2. Open /chat?buddy=<John id>
  await page.goto(`${PROD}/chat?buddy=${JOHN_ID}`)
  await page.waitForLoadState('networkidle', { timeout: 15_000 })
  await page.waitForTimeout(1500) // give init() a moment

  await check(page, 'after-load')

  // 3. Confirm conversation is open by looking for the composer
  const hasComposer = await page.locator('textarea[aria-label="Message"]').isVisible()
  if (!hasComposer) throw new Error('Composer not visible — conversation did not open')
  console.log('[chat] Composer visible — conversation opened')

  // 4. Try to send a smoke message
  await page.fill('textarea[aria-label="Message"]', 'Smoke test from buddy side')
  await page.click('button[aria-label="Send message"]')
  await page.waitForTimeout(1000)
  await check(page, 'after-send')
  console.log('[chat] Message sent without error')

  await ctx.close()
  await browser.close()

  if (consoleErrors.length) {
    console.log('Console errors observed:')
    for (const e of consoleErrors) console.log('  ', e.slice(0, 200))
  }
  console.log('PASS — buddy-side conversation opens without FK violation')
}

run().catch((e) => {
  console.error('FAIL:', e.message)
  process.exit(1)
})