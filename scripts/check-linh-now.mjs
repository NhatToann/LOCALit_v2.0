import { Client } from 'pg'
const pg = new Client({
  connectionString: 'postgresql://postgres:that1arlecchino@db.pqvnjgyqbxlylawwogjv.supabase.co:5432/postgres',
  ssl: { rejectUnauthorized: false },
})
await pg.connect()
const r = await pg.query("SELECT id, full_name, role, updated_at FROM public.profiles WHERE full_name = 'Linh Tran'")
console.log(r.rows)
const r2 = await pg.query("SELECT id, full_name, role FROM public.profiles WHERE id = '44444444-4444-4444-4444-444444444444'")
console.log('via id:', r2.rows)
await pg.end()
