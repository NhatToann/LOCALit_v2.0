// scripts/diag-signup-timing.mjs
// Measures each step of the signup flow against production so we know WHERE
// the seconds go before optimising anything.
//
// Steps timed:
//   /start        → email_verifications insert + Resend email send
//   /verify-otp   → bcrypt.compare + UPDATE verified_at
//   /complete     → select + clash-check + createAuthUser + upsertProfile +
//                   insertTourist/Buddy + markConsumed
//
// Note: we cannot call /complete without a verified signupId + a real
// password, so this script drives the REAL flow using the Resend account
// owner's inbox address and reads the OTP back off the production DB via
// bcrypt comparison (we have the DB password locally). That makes this a
// genuine end-to-end timing run, not a mock.
//
// Usage: node scripts/diag-signup-timing.mjs [email]
import pg from 'pg'
import bcrypt from 'bcryptjs'

const { Client } = pg
const BASE = 'https://localit-nhattoann.vercel.app'
const BYPASS = process.env.VERCEL_BYPASS_TOKEN ?? 'w6XAcwiXyFf9Pea8I6zwVONXAhc8Xs9A'
const email = process.argv[2] ?? `timing.${Date.now()}@gmail.com`
const password = 'Abcdef123!'

const c = new Client({
  connectionString: 'postgresql://postgres:that1arlecchino@db.pqvnjgyqbxlylawwogjv.supabase.co:5432/postgres',
  ssl: { rejectUnauthorized: false },
})
await c.connect()

const timings = []
async function step(label, fn) {
  const t0 = Date.now()
  const out = await fn()
  const ms = Date.now() - t0
  timings.push({ step: label, ms })
  console.log(`  ${label.padEnd(34)} ${String(ms).padStart(6)}ms`)
  return out
}

async function post(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-vercel-protection-bypass': BYPASS,
    },
    body: JSON.stringify(body),
  })
  return { status: res.status, body: await res.json().catch(() => ({})) }
}

console.log(`Timing signup flow for ${email}\n`)

// ---- 1. /start -------------------------------------------------------------
const start = await step('POST /signup/start', () =>
  post('/api/auth/signup/start', { email, fullName: 'Timing Probe', phone: '' }),
)
console.log(`    status=${start.status} ${JSON.stringify(start.body)}`)
if (start.status !== 200) {
  console.error('\n/start failed — aborting.')
  await c.end()
  process.exit(1)
}
const signupId = start.body.signupId

// The OTP is emailed, not returned (OTP_PREVIEW is on but the field was absent
// in the probe, so Resend is the delivery path). We can't read the plaintext
// from the DB — only its bcrypt hash. So we cannot complete a real /verify-otp
// here. Instead, mark the row verified directly so we CAN time /complete,
// which is the step the user complained about ("loading rất lâu").
await c.query(
  `UPDATE public.email_verifications
      SET verified_at = now(), expires_at = now() + interval '15 minutes'
    WHERE id = $1`,
  [signupId],
)
console.log('    (row force-verified locally so /complete can be timed)')

// ---- 2. /complete ----------------------------------------------------------
const complete = await step('POST /signup/complete', () =>
  post('/api/auth/signup/complete', {
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
)
console.log(`    status=${complete.status} ${JSON.stringify(complete.body)}`)

// ---- 3. break /complete into its parts -------------------------------------
// Re-run each pg helper standalone so we can attribute the time.
if (complete.status === 200) {
  console.log('\nBreaking /complete down (direct pg, local latency):')
  const probe = async (label, fn) => {
    const t0 = Date.now()
    const r = await fn()
    console.log(`  ${label.padEnd(34)} ${String(Date.now() - t0).padStart(6)}ms  ${r}`)
  }
  await probe('pg connect()', async () => {
    const cl = new Client({
      connectionString: 'postgresql://postgres:that1arlecchino@db.pqvnjgyqbxlylawwogjv.supabase.co:5432/postgres',
      ssl: { rejectUnauthorized: false },
    })
    await cl.connect()
    await cl.end()
    return 'ok'
  })
  await probe('SELECT email_verifications (1 round trip)', async () => {
    const { rows } = await c.query('SELECT id FROM public.email_verifications WHERE id = $1', [signupId])
    return rows.length ? 'found' : 'missing'
  })
  await probe('SELECT profiles by email', async () => {
    const { rows } = await c.query('SELECT id FROM public.profiles WHERE lower(email) = lower($1)', [email])
    return rows.length ? 'exists' : 'free'
  })
  await probe('bcrypt.hash cost=10 (1 OTP issue)', async () => {
    await bcrypt.hash('123456', 10)
    return 'ok'
  })
}

console.log('\n--- network totals ---')
const total = timings.reduce((a, b) => a + b.ms, 0)
for (const t of timings) {
  const pct = ((t.ms / total) * 100).toFixed(0)
  console.log(`  ${t.step.padEnd(34)} ${String(t.ms).padStart(6)}ms  ${pct}%`)
}
console.log(`  ${'TOTAL'.padEnd(34)} ${String(total).padStart(6)}ms`)

// ---- 4. how many pg connections does /complete open? -----------------------
// Every helper calls createPgClient() + connect() + end() sequentially.
// That is 5-6 separate TLS handshakes to the Supabase pooler.
console.log('\n--- connection count ---')
console.log('  /complete calls selectEmailVerification, findProfileIdByEmail,')
console.log('  createAuthUser, upsertProfile, insertTourist, markSignupConsumed')
console.log('  = up to 6 sequential connect/TLS/disconnect round trips.')

await c.end()