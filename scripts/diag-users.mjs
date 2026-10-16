// scripts/diag-users.mjs — list current users
import { Client } from 'pg'

const PG_URL = `postgresql://postgres:that1arlecchino@db.pqvnjgyqbxlylawwogjv.supabase.co:5432/postgres`

const c = new Client({ connectionString: PG_URL, ssl: { rejectUnauthorized: false } })
await c.connect()

const { rows: users } = await c.query(`
  SELECT u.id, u.email, u.created_at, p.role, p.full_name,
         t.id IS NOT NULL AS has_tourist,
         b.id IS NOT NULL AS has_buddy
  FROM auth.users u
  LEFT JOIN public.profiles p ON p.id = u.id
  LEFT JOIN public.tourists t ON t.id = u.id
  LEFT JOIN public.buddies  b ON b.id = u.id
  ORDER BY u.created_at
`)

console.log(`\nCurrent users in DB (${users.length}):`)
for (const u of users) {
  const tag = ['lan.pham@localit.dev','john.doe@example.com'].includes(u.email) ? 'KEEP ' : 'DEL  '
  console.log(`  [${tag}] ${u.email.padEnd(35)} role=${(u.role ?? '?').padEnd(7)} T=${u.has_tourist?'Y':'.'} B=${u.has_buddy?'Y':'.'}  ${u.full_name ?? '?'}`)
}

const { rows: evs } = await c.query(`SELECT COUNT(*)::int AS n FROM public.email_verifications`)
console.log(`\nemail_verifications: ${evs[0].n} row(s)`)

const { rows: other } = await c.query(`
  SELECT 'connections' AS t, COUNT(*)::int AS n FROM public.connections
  UNION ALL SELECT 'conversations', COUNT(*)::int FROM public.conversations
  UNION ALL SELECT 'messages', COUNT(*)::int FROM public.messages
  UNION ALL SELECT 'trips', COUNT(*)::int FROM public.trips
  UNION ALL SELECT 'reviews', COUNT(*)::int FROM public.reviews
  UNION ALL SELECT 'swipes', COUNT(*)::int FROM public.swipes
  UNION ALL SELECT 'pending_calls', COUNT(*)::int FROM public.pending_calls
  UNION ALL SELECT 'location_updates', COUNT(*)::int FROM public.location_updates
  ORDER BY t
`)
console.log('\nOther tables:')
for (const r of other) console.log(`  ${r.t.padEnd(20)} ${r.n}`)

await c.end()
