import { Client } from 'pg'
const pg = new Client({ connectionString: 'postgresql://postgres:that1arlecchino@db.pqvnjgyqbxlylawwogjv.supabase.co:5432/postgres', ssl: { rejectUnauthorized: false } })
await pg.connect()
const r = await pg.query("SELECT id, full_name, bio FROM public.profiles WHERE id = '11111111-1111-1111-1111-111111111111'")
console.log('profiles:', r.rows[0])
const r2 = await pg.query("SELECT id, bio FROM public.buddies WHERE id = '11111111-1111-1111-1111-111111111111'")
console.log('buddies:', r2.rows[0])
await pg.end()
