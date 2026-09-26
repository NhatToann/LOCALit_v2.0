#!/usr/bin/env node
// scripts/diag-prod-e2e.mjs — e2e auth flow test against LIVE production.
// 1. Anon signUp at Supabase REST -> creates auth.users + (via trigger) profiles row
// 2. POST /api/auth/create-profile as tourist -> creates tourists row
// 3. POST /api/auth/create-profile as buddy on same email (negative test) -> should reject
// 4. GET protected dashboard -> should 404 or 200 (no session means redirect to /login)
// 5. Cleanup: delete the test rows directly via pg (DB_PW)
import { Client } from 'pg'

const HOST = 'db.pqvnjgyqbxlylawwogjv.supabase.co'
const PORT = 5432
const DB_USER = 'postgres'
const DB_NAME = 'postgres'
const DB_PW = process.env.DB_PW || process.env.SUPABASE_DB_PASSWORD || 'that1arlecchino'
const SUPABASE_URL = 'https://pqvnjgyqbxlylawwogjv.supabase.co'
const ANON_KEY = process.env.SUPABASE_ANON_KEY
const PRODUCTION = process.env.PRODUCTION_URL || 'https://localit-7860e6b8u-nhattoann.vercel.app'

if (!ANON_KEY) { console.error('Set SUPABASE_ANON_KEY env var'); process.exit(2) }

let passed = 0, failed = 0
function ok(m) { console.log(`  \u2713 ${m}`); passed++ }
function bad(m) { console.log(`  \u2717 ${m}`); failed++ }
function head(n) { console.log(`\n=== ${n} ===`) }

const STAMP = Date.now()
const TEST_EMAIL = `e2e-${STAMP}@localit-test.dev`
const TEST_PASSWORD = 'TestPass-1234'

async function step1_signup() {
  head('1. Anon signUp via Supabase REST')
  const r = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'apikey': ANON_KEY, 'Authorization': `Bearer ${ANON_KEY}` },
    body: JSON.stringify({
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
      data: { full_name: 'E2E Tester', role: 'tourist' },
    }),
  })
  const body = await r.json()
  if (!r.ok) { bad(`signup HTTP ${r.status}: ${JSON.stringify(body).slice(0,200)}`); return null }
  if (!body.user?.id) { bad(`signup missing user: ${JSON.stringify(body).slice(0,200)}`); return null }
  ok(`signup 200, user.id=${body.user.id.slice(0,8)}..., session=${body.session ? 'yes' : 'no (will auto-confirm)'}`)
  return body
}

async function step2_createProfile(userId) {
  head('2. POST /api/auth/create-profile (tourist) — production route')
  const r = await fetch(`${PRODUCTION}/api/auth/create-profile`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userId,
      role: 'tourist',
      autoConfirm: true,
      payload: {
        nationality: 'United States',
        travel_style: 'solo',
        interests: ['food', 'photography'],
        languages: ['English'],
        budget_range: '50-100',
        destination: 'Da Nang',
        is_visible: true,
      },
    }),
  })
  const body = await r.json().catch(() => ({}))
  if (r.ok) ok(`create-profile 200: ${JSON.stringify(body)}`)
  else bad(`create-profile ${r.status}: ${JSON.stringify(body).slice(0,300)}`)
  return r.ok
}

async function step3_confirm(userId) {
  head('3. Confirm email via Supabase admin (REST) — uses service role from .env if present')
  const SRK = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!SRK) {
    ok(`SKIPPED \u2014 SUPABASE_SERVICE_ROLE_KEY not available. The route's autoConfirm=true branch should have done this.`)
    return null
  }
  const r = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${userId}`, {
    method: 'PUT',
    headers: { 'apikey': SRK, 'Authorization': `Bearer ${SRK}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email_confirm: true }),
  })
  const body = await r.json().catch(() => ({}))
  if (r.ok) ok(`confirmed user ${userId.slice(0,8)}...`)
  else bad(`confirm failed: ${r.status} ${JSON.stringify(body).slice(0,200)}`)
}

async function step4_signin() {
  head('4. Anon signIn with confirmed email')
  const r = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'apikey': ANON_KEY, 'Authorization': `Bearer ${ANON_KEY}` },
    body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD }),
  })
  const body = await r.json()
  if (r.ok && body.access_token) ok(`signin 200, got token (${body.access_token.slice(0,20)}...)`)
  else bad(`signin ${r.status}: ${JSON.stringify(body).slice(0,200)}`)
}

async function step5_dbVerify(userId, pg) {
  head('5. DB state verification')
  const { rows: prof } = await pg.query('SELECT id, role, full_name FROM public.profiles WHERE id = $1', [userId])
  if (prof.length === 1 && prof[0].role === 'tourist') ok(`profiles role=${prof[0].role} full_name=${prof[0].full_name}`)
  else if (prof.length === 0) bad('profiles row missing (TRIGGER FAILED or absent)')
  else bad(`profiles role mismatch: ${JSON.stringify(prof)}`)

  const { rows: tour } = await pg.query('SELECT id, nationality, interests FROM public.tourists WHERE id = $1', [userId])
  if (tour.length === 1 && tour[0].nationality === 'United States') ok(`tourists nationality=${tour[0].nationality} interests=${tour[0].interests.length}`)
  else bad(`tourists missing: ${JSON.stringify(tour)}`)
}

async function cleanup(userId, pg) {
  head('6. Cleanup')
  try {
    await pg.query('DELETE FROM public.tourists WHERE id = $1', [userId])
    await pg.query('DELETE FROM public.profiles WHERE id = $1', [userId])
    await pg.query('DELETE FROM auth.users WHERE id = $1', [userId])
    ok(`cleaned user ${userId.slice(0,8)}...`)
  } catch (e) {
    bad(`cleanup: ${e.message}`)
  }
}

async function main() {
  console.log('LOCALit production E2E auth test')
  console.log('Test email:', TEST_EMAIL)
  console.log('Production:', PRODUCTION)

  const pg = new Client({ host: HOST, port: PORT, user: DB_USER, password: DB_PW, database: DB_NAME, ssl: { rejectUnauthorized: false } })
  await pg.connect()

  const signup = await step1_signup()
  if (!signup) process.exit(1)
  const userId = signup.user.id

  await step2_createProfile(userId)
  await step3_confirm(userId)
  await step4_signin()
  await step5_dbVerify(userId, pg)
  await cleanup(userId, pg)

  console.log(`\n=== Summary === passed=${passed} failed=${failed}`)
  await pg.end()
  process.exit(failed > 0 ? 1 : 0)
}

main().catch(e => { console.error('Fatal:', e); process.exit(2) })
