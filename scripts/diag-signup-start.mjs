// scripts/diag-signup-start.mjs
// Hits POST /api/auth/signup/start on production with a throwaway email and
// prints the raw status + body, so we can tell whether the "Send verification
// code" button fails server-side or is just a client-side gate.
//
// Usage:
//   node scripts/diag-signup-start.mjs                     # throwaway address
//   node scripts/diag-signup-start.mjs user@domain.com     # specific address
//   node scripts/diag-signup-start.mjs user@domain.com "Full Name"
import pg from 'pg'
const { Client } = pg

const BASE = 'https://localit-nhattoann.vercel.app'
const BYPASS = process.env.VERCEL_BYPASS_TOKEN ?? 'w6XAcwiXyFf9Pea8I6zwVONXAhc8Xs9A'

const stamp = Date.now()
const email = process.argv[2] ?? `probe.${stamp}@gmail.com`
const fullName = process.argv[3] ?? 'Probe User'

console.log(`POST ${BASE}/api/auth/signup/start`)
console.log(`email = ${email}\n`)

const started = Date.now()
let res
try {
  res = await fetch(`${BASE}/api/auth/signup/start`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-vercel-protection-bypass': BYPASS,
    },
    body: JSON.stringify({ email, fullName, phone: '' }),
  })
} catch (e) {
  console.error('Network error:', e)
  process.exit(1)
}
const ms = Date.now() - started
const text = await res.text()
console.log(`status  = ${res.status} ${res.statusText}`)
console.log(`elapsed = ${ms}ms`)
console.log(`body    = ${text}\n`)

// If the route stored a row, tell the user whether the code was emailed or
// returned in preview mode. Also report the Resend-facing env so we can tell
// "email never left the building" from "email left but bounced".
const c = new Client({
  connectionString: 'postgresql://postgres:that1arlecchino@db.pqvnjgyqbxlylawwogjv.supabase.co:5432/postgres',
  ssl: { rejectUnauthorized: false },
})
await c.connect()
const { rows } = await c.query(
  `SELECT id, email, verified_at IS NOT NULL AS verified,
          consumed_at IS NOT NULL AS consumed, expires_at, created_at
     FROM public.email_verifications
    WHERE email = $1
    ORDER BY created_at DESC`,
  [email.toLowerCase()],
)
console.log(`email_verifications rows for ${email}: ${rows.length}`)
for (const r of rows) {
  console.log(`  ${r.created_at}  verified=${r.verified} consumed=${r.consumed} expires=${r.expires_at}`)
}
await c.end()

// Verdict summary.
console.log('\n--- verdict ---')
if (res.status === 200) {
  console.log('Server accepted the request and issued a code.')
  console.log(text.includes('__devCode')
    ? 'OTP_PREVIEW is ON in production — the code was returned, not emailed.'
    : 'Code was emailed (check spam).')
} else if (res.status === 429) {
  console.log('Rate limited (5/min per IP). Wait 60s and retry.')
} else if (res.status === 400) {
  console.log('Rejected. Either already-registered email, bad format, or short name.')
} else {
  console.log(`Unexpected ${res.status}. Check \`vercel logs\` for the server-side stack.`)
}