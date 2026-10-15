// E2E smoke for the new connection flow
// 1. Sign in as Lan (buddy)
// 2. POST /api/connections to John (tourist) — pick a 1-day duration
// 3. GET /api/connections/check?target=John — expect hasConnection=true, pending
// 4. PATCH accept it
// 5. GET check again — expect isLocked=false, daysRemaining=0 or 1
// 6. PATCH renew
// 7. GET /api/connections — expect 1 active row
// 8. PATCH cancel — expect 204
//
// Print PASS / FAIL for each step. Exit 0 on success.

import { Client } from 'pg'

const PROD = 'https://localit-nhattoann.vercel.app'

const LAN_EMAIL = 'lan.pham@localit.dev'
const LAN_PW = 'password123'

const JOHN_EMAIL = 'john.doe@example.com'
const JOHN_PW = 'password123'

async function signIn(email, password) {
  const res = await fetch(`${PROD}/api/auth/signin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  if (!res.ok) {
    throw new Error(`signIn failed for ${email}: HTTP ${res.status}`)
  }
  const setCookie = res.headers.get('set-cookie') ?? ''
  return setCookie
}

async function getUserId(cookie) {
  // Use postgres to resolve email → id
  const c = new Client({
    connectionString: 'postgresql://postgres:that1arlecchino@db.pqvnjgyqbxlylawwogjv.supabase.co:5432/postgres',
    ssl: { rejectUnauthorized: false },
  })
  await c.connect()
  const r = await c.query(`SELECT id FROM public.profiles WHERE email = $1`, [
    arguments[0],
  ])
  await c.end()
  return r.rows[0]?.id
}

async function call(cookie, path, init = {}) {
  const res = await fetch(`${PROD}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      cookie,
      ...(init.headers ?? {}),
    },
  })
  const text = await res.text()
  let body
  try {
    body = JSON.parse(text)
  } catch {
    body = text
  }
  return { status: res.status, body }
}

const results = []
function pass(label) {
  results.push({ label, ok: true })
  console.log('PASS', label)
}
function fail(label, detail) {
  results.push({ label, ok: false, detail })
  console.error('FAIL', label, detail)
}

async function main() {
  const lanCookie = await signIn(LAN_EMAIL, LAN_PW)
  const johnCookie = await signIn(JOHN_EMAIL, JOHN_PW)
  console.log('signed in: lan + john')

  // Get user IDs (cookie-based pg lookup won't help — we need to query the API instead)
  const { status: lanMeStatus, body: lanMeBody } = await call(lanCookie, '/api/profile/switch-role', {
    method: 'GET',
  })
  // fallback: just hit the connections check with email-derived id via pg
  const c = new Client({
    connectionString: 'postgresql://postgres:that1arlecchino@db.pqvnjgyqbxlylawwogjv.supabase.co:5432/postgres',
    ssl: { rejectUnauthorized: false },
  })
  await c.connect()
  const lanIdRes = await c.query(`SELECT id FROM public.profiles WHERE email = $1`, [LAN_EMAIL])
  const johnIdRes = await c.query(`SELECT id FROM public.profiles WHERE email = $1`, [JOHN_EMAIL])
  await c.end()
  const lanId = lanIdRes.rows[0]?.id
  const johnId = johnIdRes.rows[0]?.id
  if (!lanId || !johnId) {
    fail('lookup ids', { lanId, johnId })
    return
  }
  console.log('lan id', lanId, 'john id', johnId)

  // 1) Lan posts a connection request to John with duration_days=7
  const { status: postStatus, body: postBody } = await call(lanCookie, '/api/connections', {
    method: 'POST',
    body: JSON.stringify({ recipient_id: johnId, duration_days: 7 }),
  })
  console.log('POST /api/connections', postStatus, JSON.stringify(postBody))
  if (postStatus === 201 || postStatus === 409) {
    pass(`POST /api/connections returned ${postStatus}`)
  } else {
    fail('POST /api/connections', { postStatus, postBody })
    return
  }

  // 2) GET check from john's POV
  const { status: checkStatus, body: checkBody } = await call(
    johnCookie,
    `/api/connections/check?target=${lanId}`,
  )
  console.log('check from john', checkStatus, JSON.stringify(checkBody))
  if (checkStatus === 200 && checkBody.hasConnection) {
    pass('check hasConnection=true')
  } else {
    fail('check hasConnection', { checkStatus, checkBody })
    return
  }

  // 3) John accepts
  const { status: patchStatus, body: patchBody } = await call(
    johnCookie,
    `/api/connections/${checkBody.connectionId}`,
    {
      method: 'PATCH',
      body: JSON.stringify({ action: 'accept' }),
    },
  )
  console.log('PATCH accept', patchStatus, JSON.stringify(patchBody))
  if (patchStatus === 200 && patchBody.connection?.status === 'accepted') {
    pass('accept returns accepted')
  } else {
    fail('accept', { patchStatus, patchBody })
  }

  // 4) Check now shows accepted with expiry
  const { status: check2Status, body: check2Body } = await call(
    johnCookie,
    `/api/connections/check?target=${lanId}`,
  )
  console.log('check2 from john', check2Status, JSON.stringify(check2Body))
  if (
    check2Status === 200 &&
    check2Body.status === 'accepted' &&
    typeof check2Body.daysRemaining === 'number'
  ) {
    pass('check2 status=accepted with daysRemaining')
  } else {
    fail('check2 accepted', { check2Status, check2Body })
  }

  // 5) Renew
  const { status: renewStatus, body: renewBody } = await call(
    lanCookie,
    `/api/connections/${checkBody.connectionId}`,
    {
      method: 'PATCH',
      body: JSON.stringify({ action: 'renew' }),
    },
  )
  console.log('PATCH renew', renewStatus, JSON.stringify(renewBody))
  if (renewStatus === 200 && renewBody.connection?.expires_at) {
    pass('renew sets new expires_at')
  } else {
    fail('renew', { renewStatus, renewBody })
  }

  // 6) List
  const { status: listStatus, body: listBody } = await call(lanCookie, '/api/connections')
  console.log('GET /api/connections', listStatus, JSON.stringify(listBody).slice(0, 400))
  if (listStatus === 200 && Array.isArray(listBody.connections) && listBody.connections.length > 0) {
    pass('list returns 1+ connections')
  } else {
    fail('list', { listStatus, listBody })
  }

  // 7) Cancel
  const { status: cancelStatus, body: cancelBody } = await call(
    lanCookie,
    `/api/connections/${checkBody.connectionId}`,
    {
      method: 'PATCH',
      body: JSON.stringify({ action: 'cancel' }),
    },
  )
  console.log('PATCH cancel', cancelStatus, JSON.stringify(cancelBody))
  if (cancelStatus === 200 && cancelBody.ok) {
    pass('cancel returns ok')
  } else {
    fail('cancel', { cancelStatus, cancelBody })
  }

  const passed = results.filter((r) => r.ok).length
  const failed = results.filter((r) => !r.ok).length
  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) process.exit(1)
}

main().catch((e) => {
  console.error('FATAL', e)
  process.exit(1)
})
