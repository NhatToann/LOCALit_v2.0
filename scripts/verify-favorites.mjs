import { Client } from 'pg'
const c = new Client({
  connectionString: `postgresql://postgres:${process.env.SUPABASE_DB_PASSWORD}@db.pqvnjgyqbxlylawwogjv.supabase.co:5432/postgres`,
  ssl: { rejectUnauthorized: false },
})
await c.connect()
const r = await c.query(
  `SELECT p.email, b.favorite_places, b.specialties
     FROM public.buddies b JOIN public.profiles p ON p.id=b.id
     WHERE p.email='lan.pham@localit.dev'`,
)
console.log(JSON.stringify(r.rows, null, 2))

const conn = await c.query(
  `SELECT c.id, c.connection_lifecycle, c.status, t.email AS tourist_email, b.email AS buddy_email, c.accepted_at
     FROM public.connections c
     JOIN public.profiles t ON t.id = c.tourist_id
     JOIN public.profiles b ON b.id = c.buddy_id
     ORDER BY c.updated_at DESC LIMIT 5`,
)
console.log('Connections lifecycle:', JSON.stringify(conn.rows, null, 2))

await c.end()
