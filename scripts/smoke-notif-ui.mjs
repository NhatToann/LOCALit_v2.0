// UI-level smoke for the notification bug fixes.
// Signs in as Lan, then drives the bell + dropdown to verify:
//  1. The badge count matches the actual unread count.
//  2. Clicking an already-read row does NOT decrement the count.
//  3. Clicking an unread row decrements the count by 1 (not 2).
//  4. "Mark all as read" zeroes the count.

import { chromium } from 'playwright'
import { Client } from 'pg'

const URL = 'https://localit-nhattoann.vercel.app'
const BYPASS = 'w6XAcwiXyFf9Pea8I6zwVONXAhc8Xs9A'
const DB_PW = 'that1arlecchino'
const DB_HOST = 'db.pqvnjgyqbxlylawwogjv.supabase.co'
const LAN_EMAIL = 'lan.pham@localit.dev'
const LAN_PW = 'password123'

const log = (label, ok, detail = '') =>
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? '  ' + detail : ''}`)
let fails = 0
const assert = (label, cond, detail = '') => {
  if (!cond) fails++
  log(label, cond, detail)
}

const pg = new Client({
  connectionString: `postgresql://postgres:${DB_PW}@${DB_HOST}:5432/postgres`,
  ssl: { rejectUnauthorized: false },
})

async function getUnread(userId) {
  const r = await pg.query(
    'SELECT COUNT(*) FROM public.notifications WHERE user_id=$1 AND read_at IS NULL',
    [userId],
  )
  return parseInt(r.rows[0].count, 10)
}

async function seedNotifications(userId, n) {
  const values = []
  const params = [userId]
  for (let i = 0; i < n; i++) {
    values.push(`($1, 'message', $${i + 2})`)
    params.push(`[ui-smoke] seed ${i + 1}`)
  }
  await pg.query(
    `INSERT INTO public.notifications (user_id, type, title) VALUES ${values.join(',')}`,
    params,
  )
}

async function cleanup(userId, titlePrefix) {
  await pg.query(
    "DELETE FROM public.notifications WHERE user_id=$1 AND title LIKE $2",
    [userId, `${titlePrefix}%`],
  )
}

async function getBadgeText(page) {
  const bell = page.locator('button[aria-label^="Notifications"]')
  return await bell.textContent()
}

;(async () => {
  console.log('--- Notification UI smoke (Playwright) ---\n')
  await pg.connect()

  // Get Lan's user id
  const u = await pg.query("SELECT id FROM public.profiles WHERE email=$1", [LAN_EMAIL])
  if (!u.rows[0]) throw new Error('Lan not found')
  const userId = u.rows[0].id

  // Clean any leftover test notifications
  await cleanup(userId, '[ui-smoke]')

  // Seed exactly 3 unread notifications
  await seedNotifications(userId, 3)
  await new Promise((r) => setTimeout(r, 200))

  const baselineUnread = await getUnread(userId)
  console.log(`[diag] baseline unread in DB: ${baselineUnread}`)

  // Vercel Deployment Protection bypass — required for serverless checks.
  const HEADERS = { 'x-vercel-protection-bypass': BYPASS }

  const browser = await chromium.launch({ headless: true })
  // Create a fresh context each time to ensure no localStorage persistence.
  // Pass the bypass header so Vercel doesn't redirect to vercel.com/login.
  const ctx = await browser.newContext({
    storageState: { cookies: [], origins: [] },
    extraHTTPHeaders: HEADERS,
  })
  const page = await ctx.newPage()

  try {
    // 1. Sign in — fresh context, no prior session
    await page.goto(`${URL}/login`, { waitUntil: 'networkidle', timeout: 30000 })
    await page.waitForSelector('#email', { timeout: 15000 })
    await page.fill('#email', LAN_EMAIL)
    await page.fill('#password', LAN_PW)
    await page.click('button[type="submit"]')
    await page.waitForURL(/\/dashboard/, { timeout: 15000 })
    console.log('[diag] signed in, on dashboard')

    // 2. Wait for bell to show AND for the unread count to load.
    // The bell renders immediately with count=0 (default), then the
    // useEffect fetches the real count from the DB. Wait for the
    // count fetch to settle before asserting.
    await page.waitForSelector('button[aria-label^="Notifications"]', { timeout: 10000 })
    await page.waitForTimeout(2500)

    // The badge may show 99+ or the actual count. Read aria-label for the truth.
    const bellAria = await page
      .locator('button[aria-label^="Notifications"]')
      .first()
      .getAttribute('aria-label')
    console.log(`[diag] bell aria: ${bellAria}`)
    const m = bellAria.match(/(\d+)\s*unread/)
    const badgeCount = m ? parseInt(m[1], 10) : 0
    assert(
      'badge count matches DB unread count',
      badgeCount === baselineUnread,
      `badge=${badgeCount} db=${baselineUnread}`,
    )

    // 3. Open dropdown
    await page.click('button[aria-label^="Notifications"]')
    await page.waitForSelector('#notification-panel', { timeout: 5000 })

    // 4. Click first item (should be newest) — mark read.
    // Items don't have links so the dropdown stays open; the bell count
    // should drop by 1 (optimistic) when the realtime UPDATE fires.
    const firstItem = page.locator('#notification-panel ul li button').first()
    const firstLabel = await firstItem.getAttribute('aria-label')
    console.log(`[diag] clicking first item: ${firstLabel}`)
    await firstItem.click()
    // The panel stays open (no navigation). Wait for the realtime UPDATE
    // to fire so the badge reflects the new state.
    await page.waitForTimeout(1200)
    const aria2 = await page.locator('button[aria-label^="Notifications"]').first().getAttribute('aria-label')
    console.log(`[diag] bell aria after click: ${aria2}`)
    const m2 = aria2.match(/(\d+)\s*unread/)
    const newCount = m2 ? parseInt(m2[1], 10) : 0
    assert(
      'clicking unread item drops badge by 1',
      newCount === baselineUnread - 1,
      `expected=${baselineUnread - 1} got=${newCount}`,
    )

    // 5. Open again and click an ALREADY-READ item to verify BUG 1 is fixed.
    await page.click('button[aria-label^="Notifications"]')
    await page.waitForSelector('#notification-panel', { timeout: 5000 })
    // The first item is now read — click it again. With Bug 1 the count
    // drops again. With the fix it stays unchanged.
    const readItem = page.locator('#notification-panel ul li button[aria-label$=". Read"]').first()
    if ((await readItem.count()) > 0) {
      const readLabel = await readItem.getAttribute('aria-label')
      console.log(`[diag] clicking already-read item: ${readLabel}`)
      await readItem.click()
      await page.waitForTimeout(800)
      const aria3 = await page.locator('button[aria-label^="Notifications"]').first().getAttribute('aria-label')
      console.log(`[diag] bell aria after clicking read: ${aria3}`)
      const m3 = aria3.match(/(\d+)\s*unread/)
      const count3 = m3 ? parseInt(m3[1], 10) : 0
      assert(
        'clicking already-read item does NOT decrement count (Bug 1 fix)',
        count3 === newCount,
        `expected=${newCount} got=${count3}`,
      )
    } else {
      console.log('[skip] no already-read item in dropdown')
    }

    // 6. Test mark-all-read
    await page.click('button[aria-label^="Notifications"]')
    await page.waitForSelector('#notification-panel', { timeout: 5000 })
    await page.click('button[aria-label="Mark all notifications as read"]')
    await page.waitForTimeout(2500)
    const ariaFinal = await page
      .locator('button[aria-label^="Notifications"]')
      .first()
      .getAttribute('aria-label')
    console.log(`[diag] bell aria after mark-all: ${ariaFinal}`)
    // Also check the DB state at this moment
    const dbUnread = await getUnread(userId)
    console.log(`[diag] DB unread after mark-all: ${dbUnread}`)
    const mFinal = ariaFinal.match(/(\d+)\s*unread/)
    const finalCount = mFinal ? parseInt(mFinal[1], 10) : 0
    assert('mark-all-read zeros the badge', finalCount === 0, `got=${finalCount}`)
  } finally {
    // Cleanup
    await cleanup(userId, '[ui-smoke]')
    await browser.close()
    await pg.end()
  }

  console.log(`\n${fails === 0 ? 'ALL PASS' : `${fails} FAIL`}`)
  process.exit(fails === 0 ? 0 : 1)
})().catch((e) => {
  console.error('UI smoke threw:', e)
  process.exit(1)
})
