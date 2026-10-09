import { Client } from 'pg'
const pg = new Client({
  connectionString: 'postgresql://postgres:that1arlecchino@db.pqvnjgyqbxlylawwogjv.supabase.co:5432/postgres',
  ssl: { rejectUnauthorized: false },
})
await pg.connect()
const r = await pg.query("SELECT id, full_name, role FROM public.profiles ORDER BY role, full_name")
console.log('All profiles:')
for (const row of r.rows) console.log(' ', row.role, row.id, row.full_name)
const t = await pg.query("SELECT id, destination, languages, interests FROM public.tourists")
console.log('\nAll tourists:')
for (const row of t.rows) console.log(' ', row.id, row.destination, row.languages)
const b = await pg.query("SELECT id, location_city, languages, specialties FROM public.buddies")
console.log('\nAll buddies:')
for (const row of b.rows) console.log(' ', row.id, row.location_city, row.languages)
await pg.end()
