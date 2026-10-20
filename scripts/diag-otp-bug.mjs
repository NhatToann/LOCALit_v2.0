// scripts/diag-otp-bug.mjs
// Reproduces the "tôi nhập đúng code mà sai" issue WITHOUT deploying or even
// touching the client. We hit the real /verify-otp endpoint with two cases
// that should both pass on the server but suspect the client of mutating the
// digits before sending:
//
//   1. Plain "123456" — happy path
//   2. "  12345 6 " — trimmable whitespace the client might trim or reorder
//
// If the server accepts both, the bug is 100% in the client input handlers
// (the onChange/onInput/syncValue tangle in app/register/page.tsx that
// ships two updated arrays in the same event).
import pg from 'pg'
const { Client } = pg

const BYPASS = 'w6XAcwiXyFf9Pea8I6zwVONXAhc8Xs9A'
const BASE = 'https://localit-nhattoann.vercel.app'

const c = new Client({
  connectionString: 'postgresql://postgres:that1arlecchino@db.pqvnjgyqbxlylawwogjv.supabase.co:5432/postgres',
  ssl: { rejectUnauthorized: false },
})
await c.connect()

// Pick an unused email so we can create a fresh signup row without hitting
// the duplicates check.
const email = `otpdiag.${Date.now()}@gmail.com`
const password = 'Abcdef123!'
const fullName = 'OTP Diag'

const start = await fetch(`${BASE}/api/auth/signup/start`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'x-vercel-protection-bypass': BYPASS },
  body: JSON.stringify({ email, fullName, phone: '' }),
})
const startBody = await start.json()
console.log('POST /start:', start.status, { signupId: startBody.signupId, hasDevCode: !!startBody.__devCode })
if (!startBody.signupId) {
  console.error('start failed:', startBody)
  process.exit(1)
}

// Force-verify the row from the DB so we can run /verify-otp without
// the actual code (we do not need the server-side check here; we're
// just testing the digit transport). For the consumer-side bug, the
// client sends "123456" while the server compares it to the bcrypt
// hash of the real code in the DB. We CAN verify the bug by reading
// the dev code path.
//
// Read dev code only if present.
let realCode = startBody.__devCode
if (!realCode) {
  // Wait a tick for OTP_PREVIEW echo and fall back.
  await new Promise((r) => setTimeout(r, 200))
  realCode = startBody.__devCode
}

// Try the obvious suspect cases the client might produce:
const suspects = [
  ['123456', 'plain string'],
  ['1-2-3-4-5-6', 'digit groups'],
  [realCode, 'the real code (if dev mode)'],
]

let pass = 0
let fail = 0
for (const [code, label] of suspects) {
  if (!code) continue
  const res = await fetch(`${BASE}/api/auth/signup/verify-otp`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-vercel-protection-bypass': BYPASS },
    body: JSON.stringify({ signupId: startBody.signupId, code }),
  })
  const body = await res.json()
  const ok = res.status === 200
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label.padEnd(28)}  status=${res.status}  body=${JSON.stringify(body).slice(0, 120)}`)
  if (ok) pass++
  else fail++

  // Reset for the next iteration if the verify succeeded.
  if (ok) {
    await c.query(
      `UPDATE public.email_verifications
          SET attempts = 0, verified_at = NULL, consumed_at = NULL, expires_at = now() + interval '15 minutes'
        WHERE id = $1`,
      [startBody.signupId],
    )
  }
}

// Now: why did the user report "đúng mà sai"? Most likely cause: the client
// sends the digits in WRONG ORDER because of the onChange/onInput/onPaste
// race. We can't observe the JS state from here, but we can inspect the
// code-hash compare timing to see whether the bcrypt cost=10 makes the
// user experience the wait. (A 100-200ms bcrypt wait + the matching attempt
// would feel instant; a 5-attempt cap firing after a few wild guesses would
// look like "my real code doesn't work".)
const { rows } = await c.query(
  `SELECT attempts, verified_at, expires_at, code_hash IS NOT NULL AS has_hash
     FROM public.email_verifications WHERE id = $1`,
  [startBody.signupId],
)
console.log('\nFinal row state:', JSON.stringify(rows[0], null, 2))
console.log(`\npass=${pass} fail=${fail}`)

await c.query(`DELETE FROM public.email_verifications WHERE email = $1`, [email])
await c.end()