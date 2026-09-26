import { Client } from 'pg'
const c = new Client({
  connectionString: `postgresql://postgres:${process.env.DB_PW}@db.pqvnjgyqbxlylawwogjv.supabase.co:5432/postgres`,
  ssl: { rejectUnauthorized: false },
})
await c.connect()
const r1 = await c.query("SELECT column_name,data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='buddies' ORDER BY ordinal_position")
console.log('buddies columns:', r1.rows)
const r2 = await c.query("SELECT column_name,data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='tourists' ORDER BY ordinal_position")
console.log('tourists columns:', r2.rows)
const r3 = await c.query("SELECT column_name,data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='profiles' ORDER BY ordinal_position")
console.log('profiles columns:', r3.rows)
await c.end()
