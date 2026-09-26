#!/usr/bin/env node
// scripts/diag-auth-e2e.mjs — end-to-end auth flow test against production.
// Creates a throwaway user via the Supabase REST signup endpoint, then hits
// the deployed /api/auth/create-profile route with the service role, then
// signs the user in with anon key + verifies the tourists/buddies rows.
//
// Designed to be SAFE: every test email is unique (timestamp-based), and we
// delete the rows at the end. Uses DB_PW for cleanup, service role key for
// server-side ops (env var SUPABASE_SERVICE_ROLE_KEY), anon key for sign-in.

import { Client } from 'pg'

const HOST = 'db.pqvnjgyqbxlylawwogjv.supabase.co'
const PORT = 5432
const DB_USER = 'postgres'
const DB_NAME = 'postgres'
const DB_PW = process.env.DB_PW || process.env.SUPABASE_DB_PASSWORD || 'that1arlecchino'

const SUPABASE_URL = 'https://pqvnjgyqbxlylawwogjv.supabase.co'
const ANON_KEY = process.env.SUPABASE_ANON_KEY
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const PRODUCTION = process.env.PRODUCTION_URL || 'https://localit-7860e6b8u-nhattoann.vercel.app'

if (!ANON_KEY) { console.error('Set SUPABASE_ANON_KEY env var'); process.exit(2) }
if (!SERVICE_KEY) { console.error('Set SUPABASE_SERVICE_ROLE_KEY env var'); process.exit(2) }

const STAMP = Date.now()
const TEST_EMAIL = `e2e-${STAMP}@localit-test.dev`
const TEST_PASSWORD = 'testpass-1234'

let passed = 0, failed = 0
function ok(m) { console.log(`  \u2713 ${m}`); passed++ }
function bad(m) { console.log(`  \u2717 ${m}`); failed++ }
function head(n) { console.log(`\n=== ${n} ===`) }

const pg = new Client({ host: HOST, port: PORT, user: DB_USER, password: DB_PW, database: DB_NAME, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 10000 })

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
  // Note: the trigger on auth.users creates the profiles row automatically.
  ok(`signup 200, user.id=${body.user.id.slice(0,8)}..., session=${body.session ? 'yes' : 'no'}`)
  return body
}



async function step2_createProfileTourist(userId) {
  head('2. POST /api/auth/create-profile as tourist')
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
  if (r.status === 401 || r.status === 403) {
    bad(`create-profile ${r.status}: ${JSON.stringify(body).slice(0,200)} (expected for unauthenticated + autoConfirm)`)
  } else if (!r.ok) {
    bad(`create-profile ${r.status}: ${JSON.stringify(body).slice(0,200)}`)
  } else {
    ok(`create-profile 200: ${JSON.stringify(body)}`)
  }
  return body
}

async function step3_autoConfirmViaDb(userId) {
  head('3. Manually confirm email via service role (since deployment is gated)')
  const r = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${userId}`, {
    headers: { 'apikey': SERVICE_KEY, 'Authorization': `Bearer ${SERVICE_KEY}` },
  })
  if (!r.ok) { bad(`get user ${r.status}`); return false }
  const u = await r.json()
  if (u.email_confirmed_at) { ok(`email already confirmed`); return true }
  const r2 = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${userId}`, {
    method: 'PUT',
    headers: { 'apikey': SERVICE_KEY, 'Authorization': `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email_confirm: true }),
  })
  if (!r2.ok) { bad(`confirm ${r2.status}`); return false }
  ok('confirmed email')
  return true
}

async function step4_signin() {
  head('4. Anon signIn with confirmed email')
  const r = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'apikey': ANON_KEY, 'Authorization': `Bearer ${ANON_KEY}` },
    body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD }),
  })
  const body = await r.json()
  if (!r.ok) { bad(`signin ${r.status}: ${JSON.stringify(body).slice(0,200)}`); return null }
  if (!body.access_token) { bad(`no access_token: ${JSON.stringify(body).slice(0,200)}`); return null }
  ok(`signin 200, got access_token (${body.access_token.slice(0,20)}...), expires_in=${body.expires_in}s`)
  return body
}

async function step5_dbVerify(userId) {
  head('5. DB state: tourists row + profile + auth.users')
  await pg.connect()
  const { rows: prof } = await pg.query('SELECT id, role, full_name, created_at FROM public.profiles WHERE id = $1', [userId])
  if (prof.length === 1 && prof[0].role === 'tourist') ok(`profiles row: role=${prof[0].role} full_name=${prof[0].full_name}`)
  else bad(`profiles row missing or wrong role: ${JSON.stringify(prof)}`)

  const { rows: tour } = await pg.query('SELECT id, nationality, travel_style, interests FROM public.tourists WHERE id = $1', [userId])
  if (tour.length === 1 && tour[0].nationality === 'United States') ok(`tourists row: nationality=${tour[0].nationality}, interests=${tour[0].interests.length} items`)
  else bad(`tourists row missing: ${JSON.stringify(tour)}`)

  const { rows: auth } = await pg.query('SELECT id, email, email_confirmed_at FROM auth.users WHERE id = $1', [userId])
  if (auth.length === 1 && auth[0].email_confirmed_at) ok(`auth.users confirmed: ${auth[0].email}, confirmed_at=${auth[0].email_confirmed_at.toISOString()}`)
  else bad(`auth.users not confirmed: ${JSON.stringify(auth)}`)
}

async function cleanup(userId) {
  head('6. Cleanup (delete test rows)')
  try {
    await pg.query('DELETE FROM public.tourists WHERE id = $1', [userId])
    await pg.query('DELETE FROM public.profiles WHERE id = $1', [userId])
    await pg.query('DELETE FROM auth.users WHERE id = $1', [userId])
    ok('rows removed')
  } catch (e) { bad(`cleanup: ${e.message}`) }
}

async function main() {
  console.log('LOCALit auth E2E test')
  console.log('Production:', PRODUCTION)
  console.log('Test email:', TEST_EMAIL)

  const signup = await step1_signup()
  if (!signup) process.exit(1)
  const userId = signup.user.id

  await step2_createProfileTourist(userId) // may fail due to Vercel SSO gate \u2014 expected
  await step3_autoConfirmViaDb(userId)
  const tok = await step4_signin()
  if (!tok) process.exit(1)
  await step5_dbVerify(userId)
  await cleanup(userId)

  console.log(`\n=== Summary === passed=${passed} failed=${failed}`)
  try { await pg.end() } catch {}
  process.exit(failed > 0 ? 1 : 0)
}

main().catch(e => { console.error('Fatal:', e); process.exit(2) })
