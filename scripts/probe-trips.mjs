import { Client } from 'pg'
const c = new Client({
  connectionString: `postgresql://postgres:${process.env.DB_PW}@db.pqvnjgyqbxlylawwogjv.supabase.co:5432/postgres`,
  ssl: { rejectUnauthorized: false },
})
await c.connect()
const cols = await c.query(`SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='trips' ORDER BY ordinal_position`)
console.log('trips columns:', cols.rows.map(r=>r.column_name))
const tr = await c.query(`SELECT * FROM public.trips LIMIT 5`)
console.log('trips:', tr.rows)
const cn = await c.query(`SELECT * FROM public.connections LIMIT 5`)
console.log('connections:', cn.rows)
const cr = await c.query(`SELECT * FROM public.conversations LIMIT 5`)
console.log('conversations:', cr.rows)
await c.end()
