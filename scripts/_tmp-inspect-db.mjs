import { Client } from 'pg'
const c = new Client({
  host: 'db.pqvnjgyqbxlylawwogjv.supabase.co',
  port: 5432,
  user: 'postgres',
  password: 'that1arlecchino',
  database: 'postgres',
  ssl: { rejectUnauthorized: false },
})
await c.connect()
const u = await c.query("SELECT id FROM auth.users WHERE email='sarah.m@example.com'")
console.log('SARAH:', JSON.stringify(u.rows))
const s = await c.query("SELECT * FROM public.swipes WHERE swiper_role='tourist' AND swiper_id=$1", [u.rows[0]?.id])
console.log('SARAH swipes:', JSON.stringify(s.rows))
await c.end()
