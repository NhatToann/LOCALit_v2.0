#!/usr/bin/env node
/**
 * Verify the credentials documented in AGENTS.md actually work, and
 * report what each is good for. Run once after picking them up from the
 * doc — it tells us immediately which of the two OTP blockers is gone.
 *
 * Uses credentials from AGENTS.md; nothing is written to disk.
 */
import { Client } from 'pg'
import { readFileSync } from 'node:fs'

const DB_PASSWORD = process.env.SUPABASE_DB_PASSWORD || 'that1arlecchino'
const DB_HOST = 'db.pqvnjgyqbxlylawwogjv.supabase.co'
const SUPABASE = 'https://pqvnjgyqbxlylawwogjv.supabase.co'

// --- 1. Postgres ---------------------------------------------------------
const client = new Client({
  host: DB_HOST,
  port: 5432,
  user: 'postgres',
  password: DB_PASSWORD,
  database: 'postgres',
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 15000,
})

console.log('=== 1. Postgres (pg direct) ===')
try {
  await client.connect()
  const users = await client.query('select count(*)::int as n from auth.users')
  console.log(`  OK — auth.users: ${users.rows[0].n} rows`)

  const trig = await client.query(
    "select tgname from pg_trigger where tgrelid='auth.users'::regclass and not tgisinternal",
  )
  console.log(
    `  trigger on auth.users: ${trig.rows.length ? trig.rows.map((r) => r.tgname).join(', ') : 'MISSING'}`,
  )

  const ev = await client.query(
    'select count(*)::int as n from public.email_verifications',
  )
  console.log(`  email_verifications: ${ev.rows[0].n} rows (table exists = OTP storage OK)`)

  const cols = await client.query(
    `select column_name from information_schema.columns
     where table_schema='public' and table_name='email_verifications'`,
  )
  console.log(`  columns: ${cols.rows.map((r) => r.column_name).join(', ')}`)
} catch (e) {
  console.log(`  FAIL — ${e.message}`)
}

// --- 2. Reset-email throttle (anon) ---------------------------------------
console.log('\n=== 2. GoTrue reset-email throttle (/auth/v1/recover) ===')
const ANON = readFileSync('.env.local', 'utf8').match(
  /^NEXT_PUBLIC_SUPABASE_ANON_KEY=["']?([^"'\r\n]+)["']?/m,
)?.[1]

for (const email of ['darklunatv@gmail.com', `probe-${Date.now()}@example.com`]) {
  const res = await fetch(
    `${SUPABASE}/auth/v1/recover?redirect_to=${encodeURIComponent('http://localhost:3111/reset-password')}`,
    {
      method: 'POST',
      headers: {
        apikey: ANON,
        Authorization: `Bearer ${ANON}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email }),
    },
  )
  const body = await res.text()
  const verdict =
    res.status === 429
      ? 'THROTTLED'
      : res.status === 200
        ? 'ACCEPTED'
        : `status ${res.status}`
  console.log(`  ${String(res.status).padEnd(4)} ${verdict.padEnd(10)} ${email.padEnd(34)} ${body.slice(0, 70)}`)
}

// --- 3. Vercel bypass token ----------------------------------------------
console.log('\n=== 3. Vercel bypass token ===')
const BYPASS = 'w6XAcwiXyFf9Pea8I6zwVONXAhc8Xs9A'
const r = await fetch('https://localit-nhattoann.vercel.app/forgot-password', {
  headers: { 'x-vercel-protection-bypass': BYPASS },
  redirect: 'manual',
})
const loc = r.headers.get('location') ?? ''
const gated = loc.includes('vercel.com/sso-api') || r.status === 401
console.log(
  `  forgot-password -> ${r.status}${gated ? ' (STILL GATED — token rejected/expired)' : ' (bypass works)'}`,
)

if (!gated) {
  const otp = await fetch(
    'https://localit-nhattoann.vercel.app/api/auth/signup/start',
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-vercel-protection-bypass': BYPASS,
      },
      body: JSON.stringify({
        email: `probe-${Date.now()}@example.com`,
        password: 'E2eProbe12345!',
        fullName: 'Probe User',
      }),
    },
  )
  const t = await otp.text()
  console.log(`  POST /api/auth/signup/start -> ${otp.status} ${t.slice(0, 160)}`)
  console.log(
    otp.status === 200
      ? '  => PROD OTP pipeline is LIVE'
      : '  => prod OTP failed — see body above',
  )
}

await client.end().catch(() => {})