import { Client } from 'pg'
const c = new Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } })
await c.connect()
const r = await c.query(
  "SELECT table_name, column_name, data_type FROM information_schema.columns WHERE table_schema='public' AND table_name IN ('itinerary_days','itinerary_stops') AND column_name IN ('start_time','end_time') ORDER BY table_name, column_name"
)
console.log(JSON.stringify(r.rows, null, 2))
await c.end()
