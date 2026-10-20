// scripts/diag-start-latency.mjs
// Breaks down where POST /signup/start spends its 4.2s.
//
// From code: the route does findProfileIdByEmail (1 pooled query) then
// issueOtpForSignup → consumeUnverifiedCodesForEmail (pooled) +
// insertEmailVerification (pooled) + sendEmail (Resend HTTP call).
// The Resend call is outbound network I/O we do not control, so we time the
// three DB steps locally to see how much of the 4.2s is actually ours.
//
// Run it twice: the first call on a fresh lambda pays a TLS handshake for the
// first pooled connection; the second reuses the warm socket. The delta between
// the two runs IS the cold-start cost.
import pg from 'pg'
import bcrypt from 'bcryptjs'
const { Client } = pg

const BASE = 'https://localit-nhattoann.vercel.app'
const BYPASS = process.env.VERCEL_BYPASS_TOKEN ?? 'w6XAcwiXyFf9Pea8I6zwVONXAhc8Xs9A'

async function post(path, body) {
  const t0 = Date.now()
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-vercel-protection-bypass': BYPASS },
    body: JSON.stringify(body),
  })
  return { status: res.status, ms: Date.now() - t0, body: await res.json().catch(() => ({})) }
}

console.log('--- local cost of each DB step in /start ---\n')
const c = new Client({
  connectionString: 'postgresql://postgres:that1arlecchino@db.pqvnjgyqbxlylawwogjv.supabase.co:5432/postgres',
  ssl: { rejectUnauthorized: false },
})

async function timed(label, fn) {
  const t0 = Date.now()
  const r = await fn()
  console.log(`  ${label.padEnd(38)} ${String(Date.now() - t0).padStart(5)}ms`)
  return r
}

await timed('pg connect() [cold]', async () => {
  await c.connect()
  return true
})
const probeEmail = `latency.${Date.now()}@gmail.com`
await timed('findProfileIdByEmail', () => c.query(`SELECT id FROM public.profiles WHERE lower(email)=lower($1) LIMIT 1`, [probeEmail]))
await timed('consumeUnverifiedCodesForEmail', () => c.query(`UPDATE public.email_verifications SET consumed_at=NOW() WHERE email=$1 AND consumed_at IS NULL`, [probeEmail]))
const hash = await timed('bcrypt.hash(code, 10)', () => bcrypt.hash('123456', 10))
await timed('insertEmailVerification', () => c.query(
  `INSERT INTO public.email_verifications (email, pending_payload, code_hash, expires_at, ip_address, user_agent)
   VALUES ($1,$2::jsonb,$3,$4,$5,$6) RETURNING id`,
  [probeEmail, JSON.stringify({ email: probeEmail, full_name: 'Latency Probe', phone: null }), hash, new Date(Date.now() + 900000).toISOString(), null, null],
))

console.log('\n--- warm /start calls (same lambda, pooled socket) ---\n')
const runs = []
for (let i = 1; i <= 3; i++) {
  const r = await post('/api/auth/signup/start', {
    email: `lat.${Date.now()}.${i}@gmail.com`,
    fullName: 'Latency Probe',
    phone: '',
  })
  runs.push(r.ms)
  console.log(`  run ${i}: ${String(r.status).padEnd(4)} ${String(r.ms).padStart(5)}ms`)
}
const warm = runs.slice(1)
const avg = warm.reduce((a, b) => a + b, 0) / warm.length
console.log(`\n  first call (cold lambda): ${runs[0]}ms`)
console.log(`  warm average:             ${Math.round(avg)}ms`)
console.log(`  cold-start penalty:       ${runs[0] - Math.round(avg)}ms`)
console.log('\n  If the warm average is still seconds, the cost is the Resend')
console.log('  HTTP call, not Postgres. That is expected and outside our control')

await c.query(`DELETE FROM public.email_verifications WHERE email = $1`, [probeEmail]).catch(() => {})
await c.end()