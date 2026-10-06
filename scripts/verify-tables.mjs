import { Client } from 'pg'
const c = new Client({
  host: 'db.pqvnjgyqbxlylawwogjv.supabase.co',
  port: 5432,
  user: 'postgres',
  password: process.env.DB_PW,
  database: 'postgres',
  ssl: { rejectUnauthorized: false },
})
;(async () => {
  await c.connect()
  const r = await c.query(
    "SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name LIKE 'itinerar%' ORDER BY 1"
  )
  console.log('itinerary_*:', r.rows.map((x) => x.table_name))
  const r2 = await c.query(
    "SELECT count(*) AS n FROM information_schema.tables WHERE table_schema='public' AND table_name LIKE 'trip_%'"
  )
  console.log('trip_* count:', r2.rows[0].n)
  await c.end()
})()
