import { Client } from 'pg'
const pg = new Client({
  connectionString: 'postgresql://postgres:that1arlecchino@db.pqvnjgyqbxlylawwogjv.supabase.co:5432/postgres',
  ssl: { rejectUnauthorized: false },
})
await pg.connect()
const r = await pg.query("SELECT id, full_name, role, created_at, updated_at FROM public.profiles WHERE full_name = 'Lan Pham'")
console.log(r.rows)
const r2 = await pg.query("SELECT id, full_name, role FROM public.profiles WHERE email = 'lan.pham@localit.dev'")
console.log('via email:', r2.rows)
await pg.end()
