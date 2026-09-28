import { Client } from 'pg'

const c = new Client({
  host: 'db.pqvnjgyqbxlylawwogjv.supabase.co',
  port: 5432,
  user: 'postgres',
  password: 'that1arlecchino',
  database: 'postgres',
  ssl: { rejectUnauthorized: false },
})
await c.connect()

console.log('--- safe_buddies columns ---')
const v1 = await c.query(
  "SELECT column_name, data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='safe_buddies' ORDER BY ordinal_position"
)
console.log(v1.rows.map((r) => `${r.column_name}:${r.data_type}`).join(', '))

console.log('\n--- safe_buddies row count ---')
const v2 = await c.query('SELECT count(*) FROM public.safe_buddies')
console.log(v2.rows[0].count)

console.log('\n--- safe_profiles columns ---')
const v3 = await c.query(
  "SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='safe_profiles' ORDER BY ordinal_position"
)
console.log(v3.rows.map((r) => r.column_name).join(', '))

console.log('\n--- anon can SELECT safe_buddies (simulate anon role) ---')
await c.query('SET ROLE anon')
try {
  const a1 = await c.query(
    "SELECT id, location_city, latitude, longitude FROM public.safe_buddies WHERE location_city='Da Nang' LIMIT 3"
  )
  console.log(`rows returned: ${a1.rows.length}`)
  if (a1.rows.length > 0) {
    console.log(`first row: ${JSON.stringify(a1.rows[0])}`)
  }
} catch (e) {
  console.error('anon SELECT safe_buddies failed:', e.message)
}
await c.query('RESET ROLE')

console.log('\n--- anon can SELECT safe_profiles with is_online ---')
await c.query('SET ROLE anon')
try {
  const a2 = await c.query(
    "SELECT id, full_name, role, is_online FROM public.safe_profiles LIMIT 3"
  )
  console.log(`rows returned: ${a2.rows.length}`)
  if (a2.rows.length > 0) {
    console.log(`first row: ${JSON.stringify(a2.rows[0])}`)
  }
} catch (e) {
  console.error('anon SELECT safe_profiles failed:', e.message)
}
await c.query('RESET ROLE')

await c.end()
