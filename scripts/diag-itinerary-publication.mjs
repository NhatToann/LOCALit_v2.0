import { Client } from 'pg'
const c = new Client({
  connectionString: 'postgresql://postgres:that1arlecchino@db.pqvnjgyqbxlylawwogjv.supabase.co:5432/postgres',
  ssl: { rejectUnauthorized: false },
})
await c.connect()
const r = await c.query(
  "SELECT schemaname, tablename FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename LIKE 'itinerary%' ORDER BY tablename"
)
console.log(JSON.stringify(r.rows, null, 2))
await c.end()
