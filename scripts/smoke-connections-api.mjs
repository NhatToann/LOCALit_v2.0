// Direct API smoke for the new connection flow.
//
// 1. Sign in via Supabase REST to mint a real access_token JWT.
// 2. Manually build the Supabase auth cookie in the format the app reads.
// 3. Hit /api/connections, /api/connections/check, /api/connections/[id].
// 4. Verify DB state at each step.

import { Client } from 'pg'

const PROD = 'https://localit-nhattoann.vercel.app'
const BYPASS = process.env.VERCEL_BYPASS ?? ''
const PROJECT_REF = 'pqvnjgyqbxlylawwogjv'
const ANON = 'sb_publishable_3uRUZqdvazd4cENt8WOWJA_SB7HmCEE'

const LAN = { email: 'lan.pham@localit.dev', password: 'password123' }
const JOHN = { email: 'john.doe@example.com', password: 'password123' }

const results = []
function pass(label) {
  results.push({ ok: true, label })
  console.log('PASS', label)
}
function fail(label, detail) {
  results.push({ ok: false, label, detail })
  console.error('FAIL', label, detail)
}

async function getId(email) {
  const c = new Client({
    connectionString: 'postgresql://postgres:that1arlecchino@db.pqvnjgyqbxlylawwogjv.supabase.co:5432/postgres',
    ssl: { rejectUnauthorized: false },
  })
  await c.connect()
  const r = await c.query(`SELECT id FROM public.profiles WHERE email = $1`, [email])
  await c.end()
  return r.rows[0]?.id
}

async function signInToSupabase(email, password) {
  const res = await fetch(
    `https://${PROJECT_REF}.supabase.co/auth/v1/token?grant_type=password`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: ANON },
      body: JSON.stringify({ email, password }),
    },
  )
  if (!res.ok) {
    throw new Error(`signIn ${email} HTTP ${res.status}: ${await res.text()}`)
  }
  return await res.json()
}

function buildCookie(name, value) {
  // @supabase/ssr writes a `base64-<b64-of-JSON>` cookie containing the
  // full session. Our app decodes that and extracts access_token.
  const json = JSON.stringify(value)
  return `${name}=base64-${Buffer.from(json).toString('base64')}`
}

async function callApi(cookie, path, init = {}) {
  const url = BYPASS
    ? `${PROD}${path}${path.includes('?') ? '&' : '?'}x-vercel-protection-bypass=${BYPASS}`
    : `${PROD}${path}`
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 15_000)
  try {
    const res = await fetch(url, {
      ...init,
      redirect: 'manual',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(cookie ? { cookie } : {}),
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
  } catch (e) {
    if (e.name === 'AbortError') {
      return { status: 0, body: { error: 'client_timeout' } }
    }
    throw e
  } finally {
    clearTimeout(timer)
  }
}

async function main() {
  const lanId = await getId(LAN.email)
  const johnId = await getId(JOHN.email)
  if (!lanId || !johnId) {
    fail('ids', { lanId, johnId })
    return
  }
  console.log('lanId', lanId, 'johnId', johnId)

  const lanSess = await signInToSupabase(LAN.email, LAN.password)
  const johnSess = await signInToSupabase(JOHN.email, JOHN.password)
  const lanCookie = buildCookie(`sb-${PROJECT_REF}-auth-token`, {
    access_token: lanSess.access_token,
    refresh_token: lanSess.refresh_token,
    expires_in: lanSess.expires_in,
    expires_at: lanSess.expires_at,
    token_type: 'bearer',
    user: lanSess.user,
  })
  const johnCookie = buildCookie(`sb-${PROJECT_REF}-auth-token`, {
    access_token: johnSess.access_token,
    refresh_token: johnSess.refresh_token,
    expires_in: johnSess.expires_in,
    expires_at: johnSess.expires_at,
    token_type: 'bearer',
    user: johnSess.user,
  })
  pass('signed in lan + john')

  // Cleanup
  const c = new Client({
    connectionString: 'postgresql://postgres:that1arlecchino@db.pqvnjgyqbxlylawwogjv.supabase.co:5432/postgres',
    ssl: { rejectUnauthorized: false },
  })
  await c.connect()
  await c.query(
    `DELETE FROM public.connections
      WHERE (requester_id = $1 AND recipient_id = $2)
         OR (requester_id = $2 AND recipient_id = $1)`,
    [lanId, johnId],
  )

  // 1) Lan sends a request
  const r1 = await callApi(lanCookie, '/api/connections', {
    method: 'POST',
    body: JSON.stringify({ recipient_id: johnId, duration_days: 3 }),
  })
  console.log('POST /api/connections', r1.status, JSON.stringify(r1.body))
  if (r1.status === 201 && r1.body.connection?.duration_days === 3) {
    pass('POST /api/connections returns 201 with duration_days=3')
  } else {
    fail('POST /api/connections', r1)
    return
  }
  const connectionId = r1.body.connection.id

  // 2) John checks
  const r2 = await callApi(johnCookie, `/api/connections/check?target=${lanId}`)
  console.log('GET /api/connections/check', r2.status, JSON.stringify(r2.body))
  if (r2.status === 200 && r2.body.hasConnection && r2.body.status === 'pending' && r2.body.direction === 'they_sent') {
    pass('GET check returns pending / they_sent')
  } else {
    fail('GET check', r2)
  }

  // 3) John accepts
  const r3 = await callApi(johnCookie, `/api/connections/${connectionId}`, {
    method: 'PATCH',
    body: JSON.stringify({ action: 'accept' }),
  })
  console.log('PATCH accept', r3.status, JSON.stringify(r3.body))
  if (r3.status === 200 && r3.body.connection?.status === 'accepted' && r3.body.connection?.expires_at) {
    pass('PATCH accept returns accepted + expires_at')
  } else {
    fail('PATCH accept', r3)
  }

  // 4) Check again — should be active with daysRemaining
  const r4 = await callApi(johnCookie, `/api/connections/check?target=${lanId}`)
  console.log('GET check after accept', r4.status, JSON.stringify(r4.body))
  if (r4.status === 200 && r4.body.status === 'accepted' && !r4.body.isLocked && typeof r4.body.daysRemaining === 'number') {
    pass('GET check after accept shows active with daysRemaining')
  } else {
    fail('GET check after accept', r4)
  }

  // 5) Renew
  const r5 = await callApi(lanCookie, `/api/connections/${connectionId}`, {
    method: 'PATCH',
    body: JSON.stringify({ action: 'renew' }),
  })
  console.log('PATCH renew', r5.status, JSON.stringify(r5.body))
  if (r5.status === 200 && r5.body.connection?.expires_at) {
    const newDays = Math.round(
      (new Date(r5.body.connection.expires_at).getTime() - Date.now()) / 86_400_000,
    )
    if (newDays >= 2 && newDays <= 4) {
      pass(`PATCH renew resets expiry to ~3 days (got ${newDays})`)
    } else {
      fail('renew expiry diff', { newDays, body: r5.body })
    }
  } else {
    fail('PATCH renew', r5)
  }

  // 6) List
  const r6 = await callApi(lanCookie, '/api/connections')
  console.log('GET /api/connections', r6.status, 'rows:', r6.body.connections?.length)
  // We test for "at least the connection we just created" rather than
  // an exact count, because the seed accounts may have other rows.
  const found = (r6.body.connections ?? []).find((c) => c.id === connectionId)
  if (r6.status === 200 && found) {
    pass('GET /api/connections includes the test row')
  } else {
    fail('GET /api/connections', r6)
  }

  // 7) Cancel
  const r7 = await callApi(lanCookie, `/api/connections/${connectionId}`, {
    method: 'PATCH',
    body: JSON.stringify({ action: 'cancel' }),
  })
  console.log('PATCH cancel', r7.status, JSON.stringify(r7.body))
  if (r7.status === 200 && r7.body.ok) {
    pass('PATCH cancel returns ok')
  } else {
    fail('PATCH cancel', r7)
  }

  // 8) DB cleanup verification
  const after = await c.query(
    `SELECT count(*) AS n FROM public.connections
      WHERE (requester_id = $1 AND recipient_id = $2)
         OR (requester_id = $2 AND recipient_id = $1)`,
    [lanId, johnId],
  )
  await c.end()
  if (after.rows[0].n === '0') {
    pass('connection removed after cancel')
  } else {
    fail('connection still in DB', after.rows[0])
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
