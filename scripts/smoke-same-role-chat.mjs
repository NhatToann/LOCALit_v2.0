#!/usr/bin/env node
// Smoke test for the same-role chat + same-role focus gate (2026-10-09).
//
// 1. Login as a tourist + a buddy (existing seed accounts).
// 2. Tourist navigates to /chat?buddy=<buddyId> — should land on a chat
//    page (cross-role works, regression check).
// 3. Tourist navigates to /chat?buddy=<otherTouristId> — should ALSO
//    land on a chat page (same-role now allowed).
// 4. Tourist tries to send a focus request to a same-role partner —
//    the API should return 400 with the new Vietnamese message.

import { chromium } from 'playwright'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import pg from 'pg'
const { Client } = pg

// TEST AGAINST THE NEW DEPLOY (change BASE if needed for old prod testing)
const BASE = 'https://localit-nhattoann.vercel.app'
const BYPASS = 'w6XAcwiXyFf9Pea8I6zwVONXAhc8Xs9A'
const SS_DIR = path.join(import.meta.dirname, 'screenshots')
await mkdir(SS_DIR, { recursive: true })

// Pull userIds directly from the DB
const c = new Client({
  connectionString: `postgresql://postgres:${process.env.DB_PW}@db.pqvnjgyqbxlylawwogjv.supabase.co:5432/postgres`,
  ssl: { rejectUnauthorized: false },
})
await c.connect()
const buddiesQ = await c.query(`
  SELECT p.id, p.full_name FROM public.profiles p
  JOIN public.buddies b ON b.id = p.id
  WHERE p.role = 'buddy' ORDER BY p.full_name LIMIT 2
`)
const touristsQ = await c.query(`
  SELECT p.id, p.full_name FROM public.profiles p
  JOIN public.tourists t ON t.id = p.id
  WHERE p.role = 'tourist' ORDER BY p.full_name LIMIT 2
`)
await c.end()
const [buddy1, buddy2] = buddiesQ.rows
// Two tourists:
// Two tourists with VALID UUIDs, skip the aaaa... seed accounts:
const validTourists = touristsQ.rows.filter((r) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(r.id) && !r.id.startsWith('aaaa'))
const tourist1 = validTourists[0] ?? touristsQ.rows[0]
const tourist2 = validTourists.find((r) => r.id !== tourist1?.id) ?? validTourists[0]
console.log('buddy1:', buddy1?.full_name, buddy1?.id)
console.log('buddy2:', buddy2?.full_name, buddy2?.id)
console.log('tourist1:', tourist1?.full_name, tourist1?.id)
console.log('tourist2:', tourist2?.full_name, tourist2?.id)

const browser = await chromium.launch({ headless: true })
let passes = 0
let fails = 0
function check(name, cond, detail) {
  if (cond) {
    console.log('PASS:', name)
    passes++
  } else {
    console.log('FAIL:', name, detail ?? '')
    fails++
  }
}

try {
  // Sign in as tourist1
  const t1Ctx = await browser.newContext({
    extraHTTPHeaders: { 'x-vercel-protection-bypass': BYPASS },
    viewport: { width: 1280, height: 900 },
  })
  const t1Page = await t1Ctx.newPage()
  await t1Page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
  await t1Page.waitForSelector('input#email', { timeout: 30000 })
  await t1Page.fill('input#email', 'sarah.m@example.com')
  await t1Page.fill('input#password', 'password123')
  await Promise.all([
    t1Page.waitForURL('**/dashboard', { timeout: 15000 }),
    t1Page.click('button:has-text("Sign in")'),
  ])

  // CASE A: tourist → buddy (cross-role) — chat should open normally
  await t1Page.goto(`${BASE}/chat?buddy=${buddy1.id}`, { waitUntil: 'domcontentloaded' })
  await t1Page.waitForTimeout(2000)
  // Look for an error toast (the new app shell renders errors in a banner)
  const errA = await t1Page.locator('text=/Could not open conversation/i').count()
  check('cross-role chat opens (tourist→buddy) — no error banner', errA === 0, `errorCount=${errA}`)
  await t1Page.screenshot({ path: path.join(SS_DIR, 'cross-role-chat.png') })

  // CASE B: tourist → tourist (same-role) — should ALSO open
  if (tourist2?.id) {
    await t1Page.goto(`${BASE}/chat?buddy=${tourist2.id}`, { waitUntil: 'domcontentloaded' })
    await t1Page.waitForTimeout(2000)
    const errB = await t1Page.locator('text=/Could not open conversation/i').count()
    const errB2 = await t1Page.locator('text=/Pairing is only allowed across roles/i').count()
    check('same-role chat opens (tourist→tourist) — no "Pairing only allowed across roles" error', errB2 === 0, `oldErrorCount=${errB2}, anyError=${errB}`)
    await t1Page.screenshot({ path: path.join(SS_DIR, 'same-role-chat.png') })
  } else {
    console.log('SKIP: no second tourist in DB')
  }

  // CASE C: same-role focus request — API should return 400 with the new message
  if (tourist2?.id) {
    // Fetch the focus request API and verify
    const focusResp = await t1Page.evaluate(async (recipientId) => {
      const res = await fetch('/api/focus/request', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ recipient_id: recipientId }),
      })
      return { status: res.status, body: await res.json() }
    }, tourist2.id)
    console.log('focus request response:', JSON.stringify(focusResp))
    check(
      'focus request same-role returns 400 with new Vietnamese message',
      focusResp.status === 400 &&
        focusResp.body?.error === 'same_role_focus_not_allowed' &&
        focusResp.body?.message?.includes('đối với người có cùng role không thể dùng chức năng focus'),
      focusResp,
    )
  }

  console.log(`\n[smoke] passes=${passes} fails=${fails}`)
  await t1Ctx.close()
} finally {
  await browser.close()
}
process.exit(fails > 0 ? 1 : 0)
