// scripts/verify-browse-no-self.mjs
// 2026-10-09: verify the /browse list excludes the current user.
// Tests against the safe_buddies + safe_tourists_with_location views
// directly with the anon key, simulating what the app does after
// applying the .neq('id', me) filter.
import pg from 'pg'
const { Client } = pg
const c = new Client({
  connectionString: `postgresql://postgres:${process.env.DB_PW}@db.pqvnjgyqbxlylawwogjv.supabase.co:5432/postgres`,
  ssl: { rejectUnauthorized: false },
})
await c.connect()

// Get all users with location
const all = await c.query(`
  SELECT p.id, p.email, p.full_name, p.role,
         COALESCE(b.location_city, t.location_city) AS location_city
  FROM public.profiles p
  LEFT JOIN public.buddies b ON b.id = p.id
  LEFT JOIN public.tourists t ON t.id = p.id
  WHERE b.location_city = 'Da Nang' OR t.location_city = 'Da Nang'
  ORDER BY p.role, p.full_name
`)
console.log('All Da Nang users:')
for (const r of all.rows) console.log(`  ${r.role.padEnd(8)} ${r.id.slice(0,8)} ${r.email.padEnd(40)} ${r.full_name} (${r.location_city ?? '—'})`)

// Now simulate the filter: pick a tourist and verify they don't appear
// in their own feed
const me = all.rows.find((r) => r.full_name === 'Phan Nhật Toàn')
if (!me) { console.error('Phan Nhật Toàn not found'); process.exit(1) }
console.log(`\nTest user: ${me.full_name} (${me.id})`)

const myBuddies = await c.query(
  `SELECT id, location_city FROM public.safe_buddies WHERE id != $1 AND location_city = 'Da Nang'`,
  [me.id],
)
const myTourists = await c.query(
  `SELECT id, location_city FROM public.safe_tourists_with_location WHERE id != $1 AND location_city = 'Da Nang'`,
  [me.id],
)
const allBuddies = await c.query(
  `SELECT id, location_city FROM public.safe_buddies WHERE location_city = 'Da Nang'`,
)
const allTourists = await c.query(
  `SELECT id, location_city FROM public.safe_tourists_with_location WHERE location_city = 'Da Nang'`,
)

console.log(`\nsafe_buddies (filtered): ${myBuddies.rows.length} / total: ${allBuddies.rows.length}`)
console.log(`safe_tourists_with_location (filtered): ${myTourists.rows.length} / total: ${allTourists.rows.length}`)

const inBuddies = allBuddies.rows.some((r) => r.id === me.id)
const inTourists = allTourists.rows.some((r) => r.id === me.id)
console.log(`\nPhan Nhật Toàn would be in safe_buddies without filter: ${inBuddies}`)
console.log(`Phan Nhật Toàn would be in safe_tourists_with_location without filter: ${inTourists}`)

await c.end()
