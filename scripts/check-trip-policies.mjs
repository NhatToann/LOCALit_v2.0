import { Client } from 'pg'

const c = new Client({
  connectionString: 'postgresql://postgres:that1arlecchino@db.pqvnjgyqbxlylawwogjv.supabase.co:5432/postgres',
  ssl: { rejectUnauthorized: false },
})
await c.connect()
const r = await c.query(
  "SELECT policyname, cmd FROM pg_policies WHERE schemaname='public' AND tablename='trip_stops' ORDER BY policyname",
)
console.log('trip_stops:', JSON.stringify(r.rows, null, 2))
const r2 = await c.query(
  "SELECT policyname, cmd FROM pg_policies WHERE schemaname='public' AND tablename='trip_days' ORDER BY policyname",
)
console.log('trip_days:', JSON.stringify(r2.rows, null, 2))
await c.end()
