import { Client } from 'pg'
const c = new Client({
  connectionString: 'postgresql://postgres:that1arlecchino@db.pqvnjgyqbxlylawwogjv.supabase.co:5432/postgres',
  ssl: { rejectUnauthorized: false },
})
await c.connect()
const r = await c.query('DELETE FROM public.location_updates')
console.log('cleared', r.rowCount, 'rows')
await c.end()
