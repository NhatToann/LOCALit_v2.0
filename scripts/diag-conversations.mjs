import { Client } from 'pg'
const c = new Client({
  connectionString: 'postgresql://postgres:that1arlecchino@db.pqvnjgyqbxlylawwogjv.supabase.co:5432/postgres',
  ssl: { rejectUnauthorized: false },
})
await c.connect()
const r = await c.query(`SELECT c.id, c.tourist_id, c.buddy_id, p1.email AS t_email, p2.email AS b_email FROM public.conversations c LEFT JOIN public.profiles p1 ON p1.id = c.tourist_id LEFT JOIN public.profiles p2 ON p2.id = c.buddy_id`)
console.log(JSON.stringify(r.rows, null, 2))
await c.end()
