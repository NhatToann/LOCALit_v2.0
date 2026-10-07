import { Client } from 'pg'
const c = new Client({
  connectionString: 'postgresql://postgres:that1arlecchino@db.pqvnjgyqbxlylawwogjv.supabase.co:5432/postgres',
  ssl: { rejectUnauthorized: false },
})
await c.connect()
const { rows } = await c.query(`
  SELECT user_id, latitude, longitude, updated_at
  FROM public.location_updates
  ORDER BY updated_at DESC
  LIMIT 10
`)
console.log('recent location_updates:')
for (const r of rows) {
  console.log(`  ${JSON.stringify(r)}`)
}
await c.end()