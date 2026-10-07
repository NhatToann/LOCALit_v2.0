import { Client } from 'pg'
const c = new Client({
  connectionString: `postgresql://postgres:${process.env.DB_PW}@db.pqvnjgyqbxlylawwogjv.supabase.co:5432/postgres`,
  ssl: { rejectUnauthorized: false },
})
await c.connect()
const r = await c.query(`
  SELECT table_name, column_name
  FROM information_schema.columns
  WHERE table_schema='public'
    AND table_name IN ('trips','trip_stops','trip_days','trip_packing_items')
    AND column_name IN (
      'itinerary_updated_by','itinerary_updated_at',
      'updated_by','updated_at','assigned_to',
      'osm_id','osm_type','opening_hours','phone','website',
      'weather_snapshot','budget_estimate'
    )
  ORDER BY table_name, column_name
`)
console.log('Existing columns matching our list:')
console.log(JSON.stringify(r.rows, null, 2))
await c.end()
