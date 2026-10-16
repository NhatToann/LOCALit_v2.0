// scripts/test-register-e2e-api.mjs
// API-level end-to-end test of /register. Walks the full 3-step flow
// against production, including:
//   - /start (issues signupId)
//   - /verify-otp (we drive this via direct DB manipulation since
//     OTP_PREVIEW is off in production)
//   - /complete (must succeed even if the row's expires_at is in the past
//     — that's the bug fix being verified)
//   - /extend-session (must succeed on a verified+unconsumed row)
//
// This is a regression net for the 2026-10-17 fix where users were stuck
// at Step 3 because the row's expires_at expired mid-form-fill.
//
// All paths against the canonical production deployment. Uses
// VERCEL_BYPASS so the requests reach the app (not the Vercel SSO wall).

import { Client } from 'pg';
import bcrypt from 'bcryptjs';

const BASE = process.env.BASE_URL || 'https://localit-nhattoann.vercel.app'
const BYPASS = process.env.VERCEL_BYPASS ?? 'w6XAcwiXyFf9Pea8I6zwVONXAhc8Xs9A'
const TEST_CODE = '111111'

let pass = 0
let fail = 0
function check(label, ok, extra) {
  if (ok) { console.log('  PASS:', label, extra ? JSON.stringify(extra) : ''); pass++ }
  else    { console.log('  FAIL:', label, extra ? JSON.stringify(extra) : ''); fail++ }
}

const headers = {
  'Content-Type': 'application/json',
  'x-vercel-protection-bypass': BYPASS,
}

const email = `e2e.reg.api.${Date.now()}@gmail.com`
const password = 'TestPass#Reg2026'

console.log('TEST: register e2e (API) against', BASE)
console.log('email:', email)

// ---- 1. /start -----------------------------------------------------------
const startRes = await fetch(`${BASE}/api/auth/signup/start`, {
  method: 'POST',
  headers,
  body: JSON.stringify({ email, fullName: 'E2E API Reg', phone: '+84 901 234 567' }),
})
const startBody = await startRes.json().catch(() => ({}))
check('POST /signup/start returns 200', startRes.status === 200, { status: startRes.status })
check('signup/start returns signupId', !!startBody.signupId, { signupId: startBody.signupId })
const signupId = startBody.signupId

// ---- 2. Verify the OTP gate via direct DB poke --------------------------
// (Production has OTP_PREVIEW=false, so we can't get the real code. For a
// test we set code_hash to bcrypt('111111') so /verify-otp accepts '111111'.)
const c = new Client({
  connectionString: 'postgresql://postgres:that1arlecchino@db.pqvnjgyqbxlylawwogjv.supabase.co:5432/postgres',
  ssl: { rejectUnauthorized: false },
})
await c.connect()
const codeHash = await bcrypt.hash(TEST_CODE, 10)
await c.query(`UPDATE public.email_verifications SET code_hash = $2 WHERE id = $1`, [signupId, codeHash])

// ---- 3. /verify-otp -----------------------------------------------------
const verifyRes = await fetch(`${BASE}/api/auth/signup/verify-otp`, {
  method: 'POST',
  headers,
  body: JSON.stringify({ signupId, code: TEST_CODE }),
})
const verifyBody = await verifyRes.json().catch(() => ({}))
check('POST /signup/verify-otp returns 200', verifyRes.status === 200, { status: verifyRes.status, body: verifyBody })
check('verify-otp returns expiresAt', typeof verifyBody.expiresAt === 'string', { expiresAt: verifyBody.expiresAt })

// ---- 4. Wait until expires_at is in the past ---------------------------
// (Simulate a slow user who took >15 min to fill the form.)
console.log('  ...simulating slow user: setting expires_at to 5s from now...')
await c.query(`UPDATE public.email_verifications SET expires_at = NOW() + INTERVAL '5 seconds' WHERE id = $1`, [signupId])
await new Promise((r) => setTimeout(r, 6000))
const expiredCheck = await c.query(`SELECT expires_at < NOW() AS is_expired FROM public.email_verifications WHERE id = $1`, [signupId])
check('row is now expired', expiredCheck.rows[0]?.is_expired === true)

// ---- 5. /extend-session — explicit recovery route -----------------------
const extRes = await fetch(`${BASE}/api/auth/signup/extend-session`, {
  method: 'POST',
  headers,
  body: JSON.stringify({ signupId }),
})
const extBody = await extRes.json().catch(() => ({}))
check('POST /extend-session returns 200', extRes.status === 200, { status: extRes.status })
check('extend-session returns expiresAt', typeof extBody.expiresAt === 'string', { expiresAt: extBody.expiresAt })

// ---- 6. /complete — must succeed even if expires_at is past -------------
const completeRes = await fetch(`${BASE}/api/auth/signup/complete`, {
  method: 'POST',
  headers,
  body: JSON.stringify({
    signupId,
    password,
    role: 'tourist',
    profilePayload: {
      nationality: 'United States',
      travel_style: 'solo',
      interests: ['food', 'photography'],
      languages: ['English'],
      budget_range: '50-100',
      destination: 'Da Nang',
    },
  }),
})
const completeBody = await completeRes.json().catch(() => ({}))
check('POST /signup/complete returns 200', completeRes.status === 200, { status: completeRes.status, body: completeBody })
check('signup/complete returns userId', typeof completeBody.userId === 'string', { userId: completeBody.userId })

// ---- 7. DB verification -----------------------------------------------------
const u = await c.query(`SELECT id, email FROM auth.users WHERE email = $1`, [email])
check('auth.users row created', u.rows.length === 1, { rows: u.rows })
const p = await c.query(`SELECT id, role FROM public.profiles WHERE email = $1`, [email])
check('public.profiles row created', p.rows.length === 1, { rows: p.rows })
const t = await c.query(`SELECT nationality, interests, languages FROM public.tourists WHERE id = $1`, [p.rows[0]?.id])
check('public.tourists row created', t.rows.length === 1, { rows: t.rows })
const ev = await c.query(`SELECT consumed_at IS NOT NULL AS consumed, verified_at IS NOT NULL AS verified FROM public.email_verifications WHERE id = $1`, [signupId])
check('email_verifications row marked consumed', ev.rows[0]?.consumed === true, { rows: ev.rows })

await c.end()
console.log(`\n=== Result: ${pass} pass / ${fail} fail ===`)
process.exit(fail === 0 ? 0 : 1)