import { Client } from 'pg'
const c = new Client({
  connectionString: 'postgresql://postgres:that1arlecchino@db.pqvnjgyqbxlylawwogjv.supabase.co:5432/postgres',
  ssl: { rejectUnauthorized: false },
})
async function main() {
  await c.connect()
  const r = await c.query("SELECT id, location_city, latitude, longitude, is_available FROM public.buddies LIMIT 10")
  console.log('Buddies:', r.rows)
  const r2 = await c.query("SELECT id, full_name, role FROM public.profiles WHERE role = 'buddy' LIMIT 10")
  console.log('Buddy profiles:', r2.rows)
  await c.end()
}
main().catch(console.error)
