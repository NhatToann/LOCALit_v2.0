// scripts/diag-darkluna-all.mjs
// Lists EVERY auth.users / profiles / email_verifications row whose email or
// full_name contains "darkluna" (case-insensitive), plus any pending
// (unconsumed) OTP rows regardless of email — those are what block re-register.
import pg from 'pg'
const { Client } = pg

const c = new Client({
  connectionString: 'postgresql://postgres:that1arlecchino@db.pqvnjgyqbxlylawwogjv.supabase.co:5432/postgres',
  ssl: { rejectUnauthorized: false },
})
await c.connect()

const auth = await c.query(
  `SELECT id, email, created_at, email_confirmed_at IS NOT NULL AS confirmed
     FROM auth.users
    WHERE email ILIKE '%darkluna%'
    ORDER BY created_at`,
)
console.log('=== auth.users matching %darkluna% ===')
console.log(JSON.stringify(auth.rows, null, 2))

const prof = await c.query(
  `SELECT id, email, full_name, role, created_at
     FROM public.profiles
    WHERE email ILIKE '%darkluna%' OR full_name ILIKE '%darkluna%'
    ORDER BY created_at`,
)
console.log('\n=== public.profiles matching %darkluna% ===')
console.log(JSON.stringify(prof.rows, null, 2))

const ev = await c.query(
  `SELECT id, email,
          verified_at IS NOT NULL   AS verified,
          consumed_at IS NOT NULL   AS consumed,
          expires_at,
          attempts,
          created_at
     FROM public.email_verifications
    WHERE email ILIKE '%darkluna%'
    ORDER BY created_at`,
)
console.log('\n=== public.email_verifications matching %darkluna% ===')
console.log(JSON.stringify(ev.rows, null, 2))

// Unconsumed rows for ANY email — these are the "already registered" blockers
// if /start ever keys off this table. List the most recent ones only.
const pending = await c.query(
  `SELECT email, consumed_at IS NOT NULL AS consumed, expires_at, created_at
     FROM public.email_verifications
    WHERE consumed_at IS NULL
    ORDER BY created_at DESC
    LIMIT 15`,
)
console.log('\n=== unconsumed email_verifications (any email, newest 15) ===')
console.log(JSON.stringify(pending.rows, null, 2))

// Total account counts so we can see the blast radius before deleting.
const counts = await c.query(
  `SELECT 'auth.users' AS t, count(*)::int AS n FROM auth.users
   UNION ALL SELECT 'profiles', count(*)::int FROM public.profiles
   UNION ALL SELECT 'tourists', count(*)::int FROM public.tourists
   UNION ALL SELECT 'buddies',  count(*)::int FROM public.buddies`,
)
console.log('\n=== totals ===')
console.log(JSON.stringify(counts.rows, null, 2))

await c.end()