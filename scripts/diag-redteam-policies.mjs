import { Client } from 'pg'
const c = new Client({
  connectionString: `postgresql://postgres:${process.env.DB_PW}@db.pqvnjgyqbxlylawwogjv.supabase.co:5432/postgres`,
  ssl: { rejectUnauthorized: false },
})
await c.connect()
const r = await c.query("SELECT schemaname,tablename,policyname,cmd,qual::text FROM pg_policies WHERE schemaname='public' AND tablename IN ('profiles','tourists','buddies','location_updates','reviews') ORDER BY tablename,policyname")
console.log(JSON.stringify(r.rows, null, 2))
await c.end()
