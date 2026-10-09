import { Client } from 'pg'
const pg = new Client({
  connectionString: 'postgresql://postgres:that1arlecchino@db.pqvnjgyqbxlylawwogjv.supabase.co:5432/postgres',
  ssl: { rejectUnauthorized: false },
})
await pg.connect()
const r = await pg.query("SELECT id, full_name, role FROM public.profiles WHERE id IN ('11111111-1111-1111-1111-111111111111', 'aaaa1111-1111-1111-1111-111111111111', 'aaaa2222-2222-2222-2222-222222222222')")
console.log(JSON.stringify(r.rows, null, 2))
await pg.end()
