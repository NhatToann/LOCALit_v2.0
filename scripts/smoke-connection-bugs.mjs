// Full end-user flow test:
//  1) Tourist (Toan) opens Buddy (Lan) profile, sees Connect
//  2) Send request, see "Request pending"
//  3) Switch to Lan, Accept
//  4) Switch back to Toan → bell shows "1 unread"
//  5) Click bell → see "Phan Nhật Toàn accepted your connection" (NO!)
//     Actually: from Lan's perspective, the notification text says
//     "[Toan] accepted your connection request" because the
//     PATCH endpoint is called by Lan (recipient), and the
//     notification goes to the OTHER party (requester = Toan).
//  6) Click "View all" → /notifications
//  7) Navigate back to /buddies/lan → see Connected + Message + End
//  8) Click End → confirm dialog → toast → Connect button back
//
// All buttons verified by role + name. NO "Connect again".
import { chromium } from 'playwright'
import { Client } from 'pg'

const PROD = 'https://localit-nhattoann.vercel.app'
const BYPASS = process.env.VERCEL_BYPASS ?? ''
const LAN = 'lan.pham@localit.dev'
const LAN_PW = 'password123'
const TOAN = 'darklunatv@gmail.com'
const TOAN_PW = 'Test1234!'
const LAN_ID = '11111111-1111-1111-1111-111111111111'
const TOAN_ID = 'f2df98b0-96cf-451d-9d85-5060ddc1ca01'

const results = []
const pass = (l, e) => { results.push({ ok: true, label: l, extra: e }); console.log('PASS', l, e ?? '') }
const fail = (l, e) => { results.push({ ok: false, label: l, extra: e }); console.error('FAIL', l, e ?? '') }

async function dump(p, label) {
  const buttons = await p.locator('button').allTextContents()
  const links = await p.locator('a').allTextContents()
  console.log(`[dump ${label}] URL=${p.url()}`)
  console.log(`  buttons:`, buttons.filter((b) => b.trim()).slice(0, 25))
  console.log(`  links:`, links.filter((l) => l.trim()).slice(0, 25))
}

async function signIn(p, email, pw) {
  await p.goto(`${PROD}/login`, { waitUntil: 'domcontentloaded' })
  await p.fill('input[type="email"]', email)
  await p.fill('input[type="password"]', pw)
  await p.click('button[type="submit"]')
  await p.waitForURL((u) => !u.toString().includes('/login'), { timeout: 30_000 })
}

// Clean DB
const c = new Client({
  connectionString: 'postgresql://postgres:that1arlecchino@db.pqvnjgyqbxlylawwogjv.supabase.co:5432/postgres',
  ssl: { rejectUnauthorized: false },
})
await c.connect()
await c.query(
  `DELETE FROM public.connections WHERE (requester_id = $1 AND recipient_id = $2) OR (requester_id = $2 AND recipient_id = $1)`,
  [TOAN_ID, LAN_ID],
)
await c.query(`DELETE FROM public.notifications WHERE user_id IN ($1, $2)`, [TOAN_ID, LAN_ID])
await c.end()
console.log('[db] cleaned')

const browser = await chromium.launch({ headless: true })
const extraHeaders = BYPASS ? { 'x-vercel-protection-bypass': BYPASS } : {}
try {
  const toanCtx = await browser.newContext({ extraHTTPHeaders: extraHeaders })
  const lanCtx = await browser.newContext({ extraHTTPHeaders: extraHeaders })
  const toanPage = await toanCtx.newPage()
  const lanPage = await lanCtx.newPage()

  for (const [n, p] of [['toan', toanPage], ['lan', lanPage]]) {
    p.on('console', (m) => {
      if (['error', 'warning', 'warn'].includes(m.type())) {
        const t = m.text()
        if (t.includes('hot-update') || t.includes('unsplash')) return
        console.log(`[${n}.${m.type()}]`, t.slice(0, 200))
      }
    })
    p.on('pageerror', (e) => console.log(`[${n}.pageerror]`, e.message))
  }
  // Auto-accept confirm dialogs
  for (const p of [toanPage, lanPage]) {
    p.on('dialog', (d) => { console.log('[confirm]', d.message()); d.accept() })
  }

  await signIn(toanPage, TOAN, TOAN_PW); pass('toan signed in')
  await signIn(lanPage, LAN, LAN_PW); pass('lan signed in')

  // 1) Toan opens Lan's profile
  await toanPage.goto(`${PROD}/buddies/${LAN_ID}`, { waitUntil: 'domcontentloaded' })
  await toanPage.waitForTimeout(4000)
  await dump(toanPage, 'toan/lan-1')
  // 2) Click Connect
  const connectBtn = toanPage.getByRole('button', { name: /connect with lan/i })
  if ((await connectBtn.count()) === 0) fail('connect button missing'); else {
    await connectBtn.click()
    const dialog = toanPage.getByRole('dialog', { name: /connection duration/i })
    await dialog.waitFor({ state: 'visible', timeout: 5000 })
    await dialog.getByRole('radio', { name: '7 days' }).click()
    await dialog.getByRole('button', { name: /send request · 7 days/i }).click()
    try {
      await toanPage.locator('[aria-label*="Connection request pending"]').first().waitFor({ timeout: 10_000 })
      pass('toan sees "Request pending" badge')
    } catch { fail('no Request pending badge') }
    // Take screenshot showing the duration in the badge
    await toanPage.waitForTimeout(2000)
    await dump(toanPage, 'toan/lan-after-send')
  }

  // 3) Switch to Lan, open /tourists/toan
  await lanPage.goto(`${PROD}/tourists/${TOAN_ID}`, { waitUntil: 'domcontentloaded' })
  await lanPage.waitForTimeout(4000)
  await dump(lanPage, 'lan/toan')
  const acceptBtn = lanPage.getByRole('button', { name: /^accept$/i }).first()
  if ((await acceptBtn.count()) === 0) fail('accept button missing'); else {
    await acceptBtn.click()
    // Wait for state to change
    try {
      // Active badge: rendered as <span class="badge badge-success" title="...">
      // without an aria-label. Locate by visible text instead.
      await lanPage.getByText(/active ·\s*\d+d left|connected/i).first().waitFor({ timeout: 15_000 })
      pass('lan sees Active/Connected after accept')
    } catch { fail('lan did not see Active badge after accept') }
    await lanPage.waitForTimeout(2000)
    await dump(lanPage, 'lan/toan-after-accept')
  }

  // 4) Wait for Toan's realtime to receive the update
  await toanPage.waitForTimeout(3000)
  await toanPage.reload({ waitUntil: 'domcontentloaded' })
  await toanPage.waitForTimeout(4000)
  await dump(toanPage, 'toan/lan-after-reload')

  // Check for the bell badge count by looking at the aria-label
  const bell = toanPage.getByRole('button', { name: /notifications/i }).first()
  const bellAria = await bell.getAttribute('aria-label')
  console.log('[bell] aria-label =', bellAria)
  if (bellAria && /[1-9]/.test(bellAria)) pass('bell shows unread', { aria: bellAria })
  else fail('bell unread missing', { aria: bellAria })

  // Open bell
  await bell.click()
  await toanPage.waitForTimeout(1000)
  await dump(toanPage, 'toan/bell-open')
  // The bell panel should contain the accepted notification
  const acceptedText = await toanPage.getByText(/accepted your connection/i).count()
  if (acceptedText >= 1) pass('bell panel shows accepted notification')
  else fail('bell panel missing accepted notification')
  await toanPage.screenshot({ path: 'scripts/screenshots/smoke-bugs-bell.png' })
  // Close bell
  await toanPage.keyboard.press('Escape')
  await toanPage.waitForTimeout(500)

  // 5) Now check profile state — should show Connected + Message + End
  await toanPage.goto(`${PROD}/buddies/${LAN_ID}`, { waitUntil: 'domcontentloaded' })
  await toanPage.waitForTimeout(5000)
  await dump(toanPage, 'toan/lan-accepted-view')

  // Count "Message" links/buttons
  const msgLinkCount = await toanPage.getByRole('link', { name: /^message$/i }).count()
  const msgBtnCount = await toanPage.getByRole('button', { name: /^message$/i }).count()
  const totalMsg = msgLinkCount + msgBtnCount
  console.log(`[count] Message links=${msgLinkCount}, buttons=${msgBtnCount}, total=${totalMsg}`)
  if (totalMsg === 1) pass('exactly 1 Message link/button on accepted profile')
  else if (totalMsg === 0) fail('no Message link/button')
  else fail('duplicate Message buttons')

  // End button
  const endBtnCount = await toanPage.getByRole('button', { name: /^end$/i }).count()
  if (endBtnCount >= 1) pass('End button present')
  else fail('End button missing')

  // Connected badge
  const connectedBadge = await toanPage.getByText(/^connected$/i).count()
  if (connectedBadge >= 1) pass('Connected badge visible')
  else fail('Connected badge missing')

  // Verify "Connect again" is NOT present
  const connectAgain = await toanPage.getByRole('button', { name: /connect again/i }).count()
  if (connectAgain === 0) pass('no "Connect again" button on accepted view')
  else fail('"Connect again" button still rendered')

  // 6) Click End
  const endBtn = toanPage.getByRole('button', { name: /^end$/i }).first()
  await endBtn.click()
  // Wait for confirm dialog to settle, then for state to refresh.
  // The realtime echo fires DELETE on the connections table; the
  // shared useConnectionsRealtime channel should call fetch_() which
  // re-reads /api/connections/check. If the echo races we reload to
  // be sure.
  await toanPage.waitForTimeout(2000)
  // Force a fresh server fetch to be deterministic
  await toanPage.reload({ waitUntil: 'domcontentloaded' })
  await toanPage.waitForTimeout(4000)
  await dump(toanPage, 'toan/lan-after-end')
  // After End: should see "Connect with Lan" (primary), NOT "Connect again"
  const connectAgainAfterEnd = await toanPage.getByRole('button', { name: /connect again/i }).count()
  if (connectAgainAfterEnd === 0) pass('no "Connect again" button after End')
  else fail('"Connect again" still rendered after End')
  const freshConnectAfterEnd = await toanPage.getByRole('button', { name: /connect with lan/i }).count()
  if (freshConnectAfterEnd >= 1) pass('fresh "Connect with Lan" button after End')
  else fail('no "Connect with Lan" button after End')

  // 7) DB check
  const c2 = new Client({
    connectionString: 'postgresql://postgres:that1arlecchino@db.pqvnjgyqbxlylawwogjv.supabase.co:5432/postgres',
    ssl: { rejectUnauthorized: false },
  })
  await c2.connect()
  const remaining = await c2.query(
    `SELECT id, status FROM public.connections WHERE (requester_id = $1 AND recipient_id = $2) OR (requester_id = $2 AND recipient_id = $1)`,
    [TOAN_ID, LAN_ID],
  )
  await c2.end()
  if (remaining.rows.length === 0) pass('no leftover connections after End')
  else fail('connections still present after End', { rows: remaining.rows })

  // 8) Verify Lan got a notification about End
  await lanPage.waitForTimeout(3000)
  await lanPage.reload({ waitUntil: 'domcontentloaded' })
  await lanPage.waitForTimeout(5000)
  const lanBell = lanPage.getByRole('button', { name: /notifications/i }).first()
  const lanBellAria = await lanBell.getAttribute('aria-label')
  console.log('[lan bell] aria-label =', lanBellAria)
  if (lanBellAria && /[1-9]/.test(lanBellAria)) pass('lan bell shows unread (cancel notification)', { aria: lanBellAria })
  else fail('lan bell did not pick up cancel notification', { aria: lanBellAria })
  await lanBell.click()
  // Wait for the bell panel to fully render the cancel notification.
  // The cancel notification was just inserted; the bell component's
  // query may need a moment to re-fetch. We wait up to 5s for the
  // text to appear.
  await lanPage.waitForTimeout(2000)
  // Try to find the cancel notification text, waiting if it hasn't loaded yet.
  let cancelFound = false
  for (let i = 0; i < 5; i++) {
    const cancelText = await lanPage.getByText(/cancelled|cancel your connection|connection was cancelled|connection cancelled/i).count()
    if (cancelText >= 1) { cancelFound = true; break }
    await lanPage.waitForTimeout(1000)
  }
  if (cancelFound) pass('lan bell shows cancel notification text')
  else {
    // Dump bell panel text for diagnosis
    const bellText = await lanPage.locator('[data-radix-scroll-area-viewport], [class*="radix"], aside, [role="dialog"]').first().textContent().catch(() => '(none)')
    fail('lan bell missing cancel text', { bellText: bellText?.slice(0, 300) })
  }

  await toanPage.screenshot({ path: 'scripts/screenshots/smoke-bugs-final-toan.png', fullPage: true })
  await lanPage.screenshot({ path: 'scripts/screenshots/smoke-bugs-final-lan.png', fullPage: true })
} finally {
  await browser.close()
}

const passed = results.filter((r) => r.ok).length
const failed = results.filter((r) => !r.ok).length
console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
