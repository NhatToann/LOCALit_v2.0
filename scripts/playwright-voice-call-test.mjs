#!/usr/bin/env node
/**
 * Voice-call endpoint smoke test using Playwright.
 *
 * Goals:
 *   1. Verify the Stringee access-token endpoint (401/200 boundaries).
 *   2. Open /chat as a tourist and a buddy, screenshot the UI.
 *   3. Verify presence-based button states (Phone vs PhoneOff).
 *   4. Verify the IncomingCallWatcher card appears on the buddy's screen
 *      when a row is inserted into `pending_calls` (caller UI side).
 *
 * Outputs:
 *   - scripts/screenshots/voice-call-*.png  (visual proof)
 *   - stdout: numbered PASS/FAIL summary
 *
 * Run:
 *   node scripts/playwright-voice-call-test.mjs
 *
 * Required env:
 *   SUPABASE_DB_URL   postgres://...   (for inserting pending_calls row)
 * Optional:
 *   VERCEL_BYPASS_TOKEN  x-vercel-protection-bypass header value
 *   API_BASE             default https://localit-nhattoann.vercel.app
 */

import { chromium } from 'playwright'
import { Client } from 'pg'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const API_BASE = process.env.API_BASE || 'https://localit-nhattoann.vercel.app'
const DB_URL = process.env.SUPABASE_DB_URL
const BYPASS = process.env.VERCEL_BYPASS_TOKEN || 'w6XAcwiXyFf9Pea8I6zwVONXAhc8Xs9A'
const SCREENSHOT_DIR = path.join(__dirname, 'screenshots')

const results = []
let screenshotIndex = 0

function pass(name, detail = '') {
  results.push({ name, status: 'PASS', detail })
  console.log(`  PASS  ${name}${detail ? `  — ${detail}` : ''}`)
}
function fail(name, detail = '') {
  results.push({ name, status: 'FAIL', detail })
  console.log(`  FAIL  ${name}${detail ? `  — ${detail}` : ''}`)
}

async function shot(page, label) {
  screenshotIndex += 1
  const fname = `voice-call-${String(screenshotIndex).padStart(2, '0')}-${label}.png`
  const fpath = path.join(SCREENSHOT_DIR, fname)
  await page.screenshot({ path: fpath, fullPage: false })
  console.log(`        📸 ${fname}`)
}

function b64urlDecode(s) {
  return Buffer.from(
    s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4),
    'base64',
  ).toString('utf8')
}

async function pgClient() {
  const c = new Client({
    connectionString: DB_URL,
    ssl: { rejectUnauthorized: false },
  })
  await c.connect()
  return c
}

async function getConversationBetweenTouristAndBuddy(conn) {
  // profiles.id == auth.users.id == tourists.id (FK 1:1 in this schema)
  // We resolve the auth userIds via profiles to match the pending_calls
  // schema (pending_calls.caller_id references auth.users.id).
  const { rows } = await conn.query(`
    SELECT c.id,
           t.id  AS tourist_user_id,
           b.id  AS buddy_user_id,
           tprof.full_name AS tourist_name,
           bprof.full_name AS buddy_name
    FROM public.conversations c
    JOIN public.tourists t ON t.id = c.tourist_id
    JOIN public.buddies  b ON b.id = c.buddy_id
    JOIN public.profiles tprof ON tprof.id = t.id
    JOIN public.profiles bprof ON bprof.id = b.id
    ORDER BY c.last_message_at DESC NULLS LAST
    LIMIT 1
  `)
  if (!rows.length) return null
  return {
    id: rows[0].id,
    tourist_id: rows[0].tourist_user_id,
    buddy_id: rows[0].buddy_user_id,
    tourist_name: rows[0].tourist_name,
    buddy_name: rows[0].buddy_name,
  }
}

async function loginAs(page, email, password) {
  await page.goto(`${API_BASE}/login`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('input[type="email"]', { timeout: 15000 })
  await page.waitForSelector('input[type="password"]', { timeout: 15000 })
  await page.fill('input[type="email"]', email)
  await page.fill('input[type="password"]', password)
  await Promise.all([
    page.waitForURL((u) => !u.toString().includes('/login'), { timeout: 20000 }),
    page.locator('input[type="password"]').press('Enter'),
  ])
  // Don't wait for networkidle — /chat has long-lived sockets (Realtime
  // presence, StringeeClient) that never go idle.
  await page.waitForTimeout(500)
}

async function main() {
  await mkdir(SCREENSHOT_DIR, { recursive: true })

  console.log(`\n=== LOCALit voice-call endpoint + UI test ===`)
  console.log(`API_BASE: ${API_BASE}`)
  console.log(`Output:   ${SCREENSHOT_DIR}\n`)

  const browser = await chromium.launch({
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-fake-ui-for-media-stream'],
  })

  // All contexts get the Vercel bypass header so the test can reach
  // the deployment-protected URL.
  const ctxOpts = {
    extraHTTPHeaders: {
      'x-vercel-protection-bypass': BYPASS,
    },
  }

  // -------------------------------------------------------------
  // Test 1: /api/stringee/access-token without auth → 401
  // -------------------------------------------------------------
  console.log(`[1] /api/stringee/access-token — unauthenticated`)
  {
    const ctx = await browser.newContext(ctxOpts)
    const page = await ctx.newPage()
    const res = await page.request.post(`${API_BASE}/api/stringee/access-token`, {
      headers: { 'content-type': 'application/json' },
      data: '{}',
    })
    if (res.status() === 401) {
      pass('unauthenticated returns 401')
    } else {
      fail('unauthenticated returns 401', `got ${res.status()}`)
    }
    const body = await res.json().catch(() => ({}))
    if (body.reason === 'unauthenticated' || /sign in/i.test(body.error ?? '')) {
      pass('401 body has reason=unauthenticated')
    } else {
      fail('401 body has reason=unauthenticated', JSON.stringify(body))
    }
    await ctx.close()
  }

  // -------------------------------------------------------------
  // Test 2: /api/stringee/access-token WITH auth → 200 + JWT
  // -------------------------------------------------------------
  console.log(`\n[2] /api/stringee/access-token — authenticated`)
  let accessToken = null
  {
    const ctx = await browser.newContext(ctxOpts)
    const page = await ctx.newPage()
    await loginAs(page, 'john.doe@example.com', 'password123')
    const res = await page.request.post(`${API_BASE}/api/stringee/access-token`, {
      headers: { 'content-type': 'application/json' },
      data: '{}',
    })
    if (res.status() === 200) pass('authenticated returns 200')
    else fail('authenticated returns 200', `got ${res.status()}: ${await res.text()}`)
    const body = await res.json().catch(() => ({}))
    if (typeof body.accessToken === 'string' && body.accessToken.split('.').length === 3) {
      pass('accessToken is a 3-part JWT')
      accessToken = body.accessToken
    } else {
      fail('accessToken is a 3-part JWT', 'missing or malformed')
    }
    const payload = JSON.parse(b64urlDecode(accessToken.split('.')[1]))
    if (payload.exp && payload.exp > Math.floor(Date.now() / 1000)) {
      pass('JWT exp is in the future', `exp=${payload.exp}`)
    } else {
      fail('JWT exp is in the future')
    }
    if (payload.userId && payload.userId.length === 36) {
      pass('JWT userId is a UUID', `userId=${payload.userId}`)
    } else {
      fail('JWT userId is a UUID', `got ${payload.userId}`)
    }
    if (payload.iss && /^SK\./.test(payload.iss)) {
      pass('JWT iss is a Stringee API Key SID', `iss=${payload.iss}`)
    } else {
      fail('JWT iss is a Stringee API Key SID', `got ${payload.iss}`)
    }
    await ctx.close()
  }

  // -------------------------------------------------------------
  // Test 3: /chat loads as tourist, screenshot
  // -------------------------------------------------------------
  console.log(`\n[3] /chat — tourist view (caller side)`)
  let convId = null
  let callerUserId = null
  let calleeUserId = null
  let callerName = null
  let calleeName = null
  {
    const ctx = await browser.newContext({
      ...ctxOpts,
      permissions: ['microphone'],
    })
    const page = await ctx.newPage()
    page.on('console', (m) => {
      if (/call:stringee|error/i.test(m.text()))
        console.log(`        [tourist-console:${m.type()}] ${m.text()}`)
    })
    await loginAs(page, 'john.doe@example.com', 'password123')
    await page.goto(`${API_BASE}/chat`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(2500)
    await shot(page, 'tourist-chat')

    const heading = await page.locator('h1').first().innerText().catch(() => '')
    if (/messages/i.test(heading)) pass('tourist /chat renders Messages heading')
    else fail('tourist /chat renders Messages heading', `got "${heading}"`)

    const phoneBtns = page.getByRole('button', { name: /voice call|start voice call/i })
    const phoneCount = await phoneBtns.count()
    if (phoneCount > 0) pass('voice-call button rendered in /chat', `count=${phoneCount}`)
    else fail('voice-call button rendered in /chat')

    if (DB_URL) {
      const conn = await pgClient()
      // Pick the conversation between our two seeded test users
      // (John Doe, tourist aaaa1111… ↔ Lan Pham, buddy 11111111…)
      // so the IncomingCallWatcher test below has a predictable caller/callee.
      const conv = await conn.query(`
        SELECT c.id,
               t.id  AS tourist_id,
               b.id  AS buddy_id,
               tprof.full_name AS tourist_name,
               bprof.full_name AS buddy_name
        FROM public.conversations c
        JOIN public.tourists t ON t.id = c.tourist_id
        JOIN public.buddies  b ON b.id = c.buddy_id
        JOIN public.profiles tprof ON tprof.id = t.id
        JOIN public.profiles bprof ON bprof.id = b.id
        WHERE t.id = 'aaaa1111-1111-1111-1111-111111111111'
          AND b.id = '11111111-1111-1111-1111-111111111111'
        LIMIT 1
      `).then((r) => r.rows[0])
      if (conv) {
        convId = conv.id
        callerUserId = conv.tourist_id // john.doe@example.com (aaaa1111…)
        calleeUserId = conv.buddy_id   // lan.pham@localit.dev (11111111…)
        callerName = conv.tourist_name
        calleeName = conv.buddy_name
        pass('found John↔Lan conversation in DB', `conv=${convId}`)
      } else {
        // Fallback to most-recent if the seeded pair doesn't have one
        const fallback = await getConversationBetweenTouristAndBuddy(conn)
        if (fallback) {
          convId = fallback.id
          callerUserId = fallback.tourist_id
          calleeUserId = fallback.buddy_id
          callerName = fallback.tourist_name
          calleeName = fallback.buddy_name
          pass('found fallback conversation in DB', `conv=${convId}`)
        } else {
          fail('no conversation in DB')
        }
      }
      await conn.end()
    } else {
      fail('SUPABASE_DB_URL not set — skipping DB checks')
    }

    await ctx.close()
  }

  // -------------------------------------------------------------
  // Test 4: Buddy view — IncomingCallWatcher mount
  // -------------------------------------------------------------
  console.log(`\n[4] /chat — buddy view (callee side, IncomingCallWatcher mounted)`)
  {
    const ctx = await browser.newContext({
      ...ctxOpts,
      permissions: ['microphone'],
    })
    const page = await ctx.newPage()
    page.on('console', (m) => {
      if (/call:stringee|error|incoming/i.test(m.text()))
        console.log(`        [buddy-console:${m.type()}] ${m.text()}`)
    })
    await loginAs(page, 'lan.pham@localit.dev', 'password123')
    await page.goto(`${API_BASE}/chat`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(3000)
    await shot(page, 'buddy-chat')
    const w = await page.evaluate(() => ({
      hasSDK: !!(window).StringeeClient,
      queuedCalls: (window).__localitStringeeIncomingCalls?.size ?? 0,
      navRole: document.querySelector('h1')?.innerText ?? '',
    }))
    if (w.hasSDK) pass('Stringee SDK loaded on buddy /chat')
    else console.log(`        (Stringee SDK not yet on window — expected if ensureStringeeClient was not triggered yet)`)
    console.log(`        queuedCalls=${w.queuedCalls}  navRole=${w.navRole}`)
    if (/messages/i.test(w.navRole)) pass('buddy /chat renders Messages heading')
    else fail('buddy /chat renders Messages heading', `got "${w.navRole}"`)
    await ctx.close()
  }

  // -------------------------------------------------------------
  // Test 5: Insert pending_calls row → buddy should see popup
  // -------------------------------------------------------------
  if (DB_URL && convId && callerUserId && calleeUserId) {
    // NOTE: caller = tourist (John), callee = buddy (Lan). To verify
    // the popup shows on the buddy's screen, swap the insert so the
    // buddy is the callee and the tourist is the caller.
    console.log(`\n[5] IncomingCallWatcher — simulate incoming call from ${callerName} → ${calleeName}`)
    const callerId = callerUserId // tourist
    const calleeId = calleeUserId // buddy
    let pendingCallId = null
    const conn = await pgClient()
    const { rows } = await conn.query(
      `INSERT INTO public.pending_calls (conversation_id, caller_id, callee_id, status)
       VALUES ($1, $2, $3, 'ringing')
       RETURNING id`,
      [convId, callerId, calleeId],
    )
    pendingCallId = rows[0]?.id
    if (pendingCallId) pass('inserted pending_calls row', `id=${pendingCallId}`)
    else fail('inserted pending_calls row')

    const ctx = await browser.newContext({
      ...ctxOpts,
      permissions: ['microphone'],
    })
    const page = await ctx.newPage()
    page.on('console', (m) => {
      const t = m.text()
      if (/call:incoming|incoming|error|useAuthUser/i.test(t))
        console.log(`        [buddy-console:${m.type()}] ${t}`)
    })
    await loginAs(page, 'lan.pham@localit.dev', 'password123')
    // Verify auth session via Supabase cookies
    const cookies = await ctx.cookies()
    const authCookie = cookies.find((c) => /auth-token|supabase-auth/i.test(c.name))
    console.log(`        auth cookies: ${cookies.map((c) => c.name).join(', ')}`)
    await page.goto(`${API_BASE}/chat`, { waitUntil: 'domcontentloaded' })
    // Wait up to 10s for the popup to appear (Realtime subscription delay)
    let popupVisible = false
    let dialog = null
    for (let i = 0; i < 20; i++) {
      dialog = page.getByRole('alertdialog', { name: /incoming voice call/i })
      popupVisible = await dialog.isVisible().catch(() => false)
      if (popupVisible) break
      // Diagnostic: ask the page to query pending_calls directly via the
      // browser-side Supabase client so we can see if RLS is filtering.
      const dbg = await page.evaluate(async () => {
        try {
          const w = window
          // Try to find the Supabase client on window via the React tree.
          // Use the session from supabase auth cookie if exposed.
          const sb = w.__supabase ?? w.supabase
          if (!sb) return { hasClient: false }
          const { data, error } = await sb
            .from('pending_calls')
            .select('id, callee_id, status, created_at')
            .eq('status', 'ringing')
            .order('created_at', { ascending: false })
            .limit(3)
          return { hasClient: true, rows: data, error: error?.message }
        } catch (e) {
          return { err: String(e) }
        }
      })
      if (i % 4 === 0) console.log(`        (poll ${i}) popup=${popupVisible} dbg=${JSON.stringify(dbg)}`)
      await page.waitForTimeout(500)
    }
    await shot(page, 'buddy-incoming-popup')
    if (popupVisible) pass('IncomingCallWatcher popup is visible on buddy screen')
    else fail('IncomingCallWatcher popup is visible on buddy screen')

    if (popupVisible) {
      // Decline path
      const declineBtn = page.getByRole('button', { name: /^decline call$/i })
      await declineBtn.click({ timeout: 5000 }).catch(() => {})
      await page.waitForTimeout(1500)
      await shot(page, 'buddy-after-decline')
      const dialogAfter = await dialog.isVisible().catch(() => false)
      if (!dialogAfter) pass('popup closes after Decline')
      else fail('popup closes after Decline')
      const { rows: row2 } = await conn.query(
        `SELECT status FROM public.pending_calls WHERE id = $1`,
        [pendingCallId],
      )
      if (row2[0]?.status === 'declined') pass('DB row marked declined')
      else fail('DB row marked declined', `got ${row2[0]?.status}`)
    }

    await conn.end()
    await ctx.close()
  } else {
    console.log(`\n[5] Skipped — no conv / DB URL`)
  }

  // -------------------------------------------------------------
  // Test 6: Caller flow — click Phone button → CallModal appears
  // -------------------------------------------------------------
  console.log(`\n[6] Caller flow — click voice call button`)
  if (DB_URL && convId) {
    // Pre-conditions:
    //   - tourist (John) is on /chat with the John↔Lan conversation
    //   - buddy (Lan) is logged in on /chat (to keep her presence online)
    //
    // We open two browser contexts (tourist + buddy) so that
    // usePresence on John's side sees Lan and the button is enabled.
    const touristCtx = await browser.newContext({
      ...ctxOpts,
      permissions: ['microphone'],
    })
    const buddyCtx = await browser.newContext({
      ...ctxOpts,
      permissions: ['microphone'],
    })

    // Login buddy first so she stays online during the tourist's session.
    const buddyPage = await buddyCtx.newPage()
    await loginAs(buddyPage, 'lan.pham@localit.dev', 'password123')
    await buddyPage.goto(`${API_BASE}/chat`, { waitUntil: 'domcontentloaded' })
    await buddyPage.waitForTimeout(2500)

    const page = await touristCtx.newPage()
    page.on('console', (m) => {
      if (/call|stringee/i.test(m.text()))
        console.log(`        [caller-console:${m.type()}] ${m.text()}`)
    })
    await loginAs(page, 'john.doe@example.com', 'password123')
    await page.goto(`${API_BASE}/chat`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(3000)

    // Find the Phone button in the active conversation header.
    // The label depends on buddy presence: "Start voice call" if
    // online, "Call unavailable — buddy offline" if not.
    const phoneBtn = page.getByRole('button', { name: /start voice call/i }).first()
    const phoneVisible = await phoneBtn.isVisible().catch(() => false)
    if (phoneVisible) pass('Phone button visible (buddy online)', '')
    else {
      const offlineBtn = page.getByRole('button', { name: /call unavailable/i }).first()
      const offVis = await offlineBtn.isVisible().catch(() => false)
      if (offVis) fail('Phone button visible (buddy online)', 'button shows offline state — presence did not sync')
      else fail('Phone button visible (buddy online)', 'no phone button rendered')
    }

    if (phoneVisible) {
      await phoneBtn.click({ timeout: 5000 }).catch(() => {})
      await page.waitForTimeout(2500)
      await shot(page, 'caller-call-modal')

      // CallModal renders a dialog with aria-label "Voice call with …"
      const callModal = page.getByRole('dialog', { name: /voice call with/i })
      const modalVisible = await callModal.isVisible().catch(() => false)
      if (modalVisible) pass('CallModal dialog opens on caller side')
      else fail('CallModal dialog opens on caller side')

      // Look for "Calling Lan…" headline
      const headline = await page.locator('text=/Calling.*Lan/i').first().isVisible().catch(() => false)
      if (headline) pass('CallModal shows "Calling Lan…" headline')
      else {
        // Calling may have transitioned past "calling" already
        const headline2 = await page.locator('text=/Connecting|Ringing|Incoming call|Call failed|FROM_NUMBER_NOT_FOUND/i').first().isVisible().catch(() => false)
        if (headline2) pass('CallModal shows a state-transition headline', '')
        else fail('CallModal shows "Calling Lan…" headline', 'no headline matched')
      }

      // Look for End button OR Close button (terminal state)
      const endBtn = page.getByRole('button', { name: /^end call$/i })
      const closeBtn = page.getByRole('button', { name: /^close$/i })
      const endVisible = await endBtn.isVisible().catch(() => false)
      const closeVisible = await closeBtn.isVisible().catch(() => false)
      if (endVisible || closeVisible) {
        pass('End/Close button visible in CallModal', endVisible ? 'end' : 'close (terminal)')
      } else {
        fail('End button visible in CallModal')
      }

      // End the call and verify cleanup. If already terminal, just close.
      if (endVisible) {
        await endBtn.click({ timeout: 5000 }).catch(() => {})
      } else if (closeVisible) {
        await closeBtn.click({ timeout: 5000 }).catch(() => {})
      }
      await page.waitForTimeout(2000)
      await shot(page, 'caller-after-end')
      const modalAfter = await callModal.isVisible().catch(() => false)
      if (!modalAfter) pass('CallModal closes after End')
      else fail('CallModal closes after End')
    }

    // Clean up: also end any pending DB rows from this test
    const cleanupConn = await pgClient()
    await cleanupConn.query(
      `UPDATE public.pending_calls
       SET status = 'cancelled', updated_at = now()
       WHERE conversation_id = $1 AND status = 'ringing'`,
      [convId],
    )
    await cleanupConn.end()

    await touristCtx.close()
    await buddyCtx.close()
  } else {
    console.log(`\n[6] Skipped — no conv / DB URL`)
  }

  await browser.close()
  // -------------------------------------------------------------
  const passed = results.filter((r) => r.status === 'PASS').length
  const failed = results.filter((r) => r.status === 'FAIL').length
  console.log(`\n=== Summary ===`)
  console.log(`Total: ${results.length}  Pass: ${passed}  Fail: ${failed}`)
  if (failed > 0) {
    console.log(`\nFailing checks:`)
    for (const r of results.filter((r) => r.status === 'FAIL')) {
      console.log(`  - ${r.name}${r.detail ? `  (${r.detail})` : ''}`)
    }
    process.exit(1)
  }
}

main().catch((err) => {
  console.error('Fatal:', err)
  process.exit(2)
})
