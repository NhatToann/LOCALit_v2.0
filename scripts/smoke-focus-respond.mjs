// Smoke test for the new /api/focus/[requestId]/{respond,cancel} routes.
// Logs in as Lan (buddy) and John (tourist) on the seed accounts,
// then exercises:
//   1. Cross-role request  → /api/focus/request  (201)
//   2. Recipient responds  → /api/focus/{id}/respond {action:"accept"} (200, session)
//   3. Requester tries to cancel the same request → 409 already_handled
//   4. Decline path on a fresh request → 200, status="declined"
import { chromium } from 'playwright'
import { Client } from 'pg'

const BASE = 'https://localit-nhattoann.vercel.app'
const BYPASS = 'w6XAcwiXyFf9Pea8I6zwVONXAhc8Xs9A'
const DB_URL = `postgresql://postgres:that1arlecchino@db.pqvnjgyqbxlylawwogjv.supabase.co:5432/postgres`

async function getAuthCookie(email, password) {
  const browser = await chromium.launch()
  const ctx = await browser.newContext({
    extraHTTPHeaders: { 'x-vercel-protection-bypass': BYPASS },
  })
  const page = await ctx.newPage()
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
  await page.fill('input#email', email)
  await page.fill('input#password', password)
  await Promise.all([
    page.waitForURL('**/dashboard', { timeout: 20000 }),
    page.click('button:has-text("Sign in")'),
  ])
  const cookies = await ctx.cookies()
  await browser.close()
  return cookies
}

async function postWithCookies(url, body, cookies) {
  const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join('; ')
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      cookie: cookieHeader,
      'x-vercel-protection-bypass': BYPASS,
    },
    body: JSON.stringify(body),
  })
  const text = await res.text()
  return { status: res.status, json: (() => { try { return JSON.parse(text) } catch { return { _raw: text } } })() }
}

async function getIdByEmail(email) {
  const client = new Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } })
  await client.connect()
  const r = await client.query('SELECT id FROM public.profiles WHERE email = $1', [email])
  await client.end()
  return r.rows[0]?.id
}

async function cleanup(client) {
  // Remove any leftover requests from this test
  await client.query(
    `DELETE FROM public.focus_requests
     WHERE requester_id IN (SELECT id FROM public.profiles WHERE email IN ('john.doe@example.com','lan.pham@localit.dev'))
        OR recipient_id IN (SELECT id FROM public.profiles WHERE email IN ('john.doe@example.com','lan.pham@localit.dev'))`,
  )
  await client.query(
    `DELETE FROM public.focus_sessions
     WHERE user_a_id IN (SELECT id FROM public.profiles WHERE email IN ('john.doe@example.com','lan.pham@localit.dev'))
        OR user_b_id IN (SELECT id FROM public.profiles WHERE email IN ('john.doe@example.com','lan.pham@localit.dev'))`,
  )
}

let failures = 0
function expect(label, ok, extra) {
  if (ok) {
    console.log(`PASS: ${label}${extra ? ' — ' + JSON.stringify(extra) : ''}`)
  } else {
    console.log(`FAIL: ${label}${extra ? ' — ' + JSON.stringify(extra) : ''}`)
    failures++
  }
}

const main = async () => {
  const db = new Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } })
  await db.connect()
  await cleanup(db)
  await db.end()

  // John Doe is mislabeled as 'buddy' in public.profiles (post-seed
  // script flipped his role). Use Sarah Miller (real tourist) instead.
  const [johnId, lanId, sarahId] = await Promise.all([
    getIdByEmail('john.doe@example.com'),
    getIdByEmail('lan.pham@localit.dev'),
    getIdByEmail('sarah.m@example.com'),
  ])
  if (!johnId || !lanId || !sarahId) throw new Error('seed users not found')
  console.log(`Sarah (tourist) = ${sarahId}`)
  console.log(`John (mislabeled buddy) = ${johnId}`)
  console.log(`Lan (buddy)   = ${lanId}`)

  // 1) Sarah signs in, sends a request to Lan (cross-role happy path)
  const sarahCookies = await getAuthCookie('sarah.m@example.com', 'password123')
  console.log('sarahCookies:', sarahCookies.map(c => `${c.name}=${c.value.slice(0,20)}...`).join('; '))
  const convId = await (async () => {
    const client = new Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } })
    await client.connect()
    const r = await client.query(
      `SELECT c.id FROM public.conversations c
       WHERE (c.tourist_id = $1 AND c.buddy_id = $2)
          OR (c.tourist_id = $2 AND c.buddy_id = $1)
       LIMIT 1`,
      [johnId, lanId],
    )
    await client.end()
    return r.rows[0]?.id ?? null
  })()

  console.log('Sarah→Lan request body:', JSON.stringify({ recipient_id: lanId, conversation_id: convId }))
  const req1 = await postWithCookies(
    `${BASE}/api/focus/request`,
    { recipient_id: lanId, conversation_id: convId },
    sarahCookies,
  )
  expect('focus request 201', req1.status === 201 && req1.json.ok === true, { status: req1.status, body: req1.json, full: JSON.stringify(req1.json) })
  const requestId1 = req1.json.request?.id
  expect('focus request returns id', !!requestId1)

  // 2) Lan signs in, accepts → should return a session
  const lanCookies = await getAuthCookie('lan.pham@localit.dev', 'password123')
  const accept = await postWithCookies(
    `${BASE}/api/focus/${requestId1}/respond`,
    { action: 'accept' },
    lanCookies,
  )
  expect('accept returns 200 with session', accept.status === 200 && !!accept.json.session?.id, { status: accept.status, body: accept.json })

  // 3) John tries to cancel the now-accepted request → 409 already_handled
  const cancelLate = await postWithCookies(
    `${BASE}/api/focus/${requestId1}/cancel`,
    {},
    sarahCookies,
  )
  expect('cancel-after-accept returns already_handled', cancelLate.json.already_handled === true, { status: cancelLate.status, body: cancelLate.json })

  // 4) Decline path on a fresh request
  const req2 = await postWithCookies(
    `${BASE}/api/focus/request`,
    { recipient_id: lanId, conversation_id: convId },
    sarahCookies,
  )
  expect('second focus request 201', req2.status === 201, { status: req2.status, body: req2.json })
  const requestId2 = req2.json.request?.id
  const decline = await postWithCookies(
    `${BASE}/api/focus/${requestId2}/respond`,
    { action: 'decline' },
    lanCookies,
  )
  expect('decline returns 200 status=declined', decline.status === 200 && decline.json.status === 'declined', { status: decline.status, body: decline.json })

  // 5) Cross-role request from Lan's side, then cancel it
  const req3 = await postWithCookies(
    `${BASE}/api/focus/request`,
    { recipient_id: sarahId, conversation_id: convId },
    lanCookies,
  )
  expect('lan→john request 201', req3.status === 201, { status: req3.status, body: req3.json })
  const requestId3 = req3.json.request?.id
  const cancelFresh = await postWithCookies(
    `${BASE}/api/focus/${requestId3}/cancel`,
    {},
    lanCookies,
  )
  expect('cancel-fresh returns 200 status=cancelled', cancelFresh.status === 200 && cancelFresh.json.status === 'cancelled', { status: cancelFresh.status, body: cancelFresh.json })

  // 6) Wrong-caller cancel → 403 (sarah tries to cancel Lan's request)
  const wrongCancel = await postWithCookies(
    `${BASE}/api/focus/${requestId3}/cancel`,
    {},
    sarahCookies,
  )
  expect('cancel by non-requester returns 403', wrongCancel.status === 403, { status: wrongCancel.status, body: wrongCancel.json })

  // 7) Unknown request id → 404
  const bogus = await postWithCookies(
    `${BASE}/api/focus/00000000-0000-0000-0000-000000000000/respond`,
    { action: 'accept' },
    lanCookies,
  )
  expect('respond on unknown id returns 404', bogus.status === 404, { status: bogus.status, body: bogus.json })

  // Cleanup
  const db2 = new Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } })
  await db2.connect()
  await cleanup(db2)
  await db2.end()

  console.log(failures === 0 ? 'All checks passed.' : `FAILED: ${failures}`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((e) => { console.error(e); process.exit(2) })
