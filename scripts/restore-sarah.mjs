import { Client } from 'pg'
const pg = new Client({
  connectionString: 'postgresql://postgres:that1arlecchino@db.pqvnjgyqbxlylawwogjv.supabase.co:5432/postgres',
  ssl: { rejectUnauthorized: false },
})
await pg.connect()
const r = await pg.query(`
  UPDATE public.profiles
  SET role = 'tourist'
  WHERE full_name = 'Sarah Miller'
  RETURNING id, full_name, role
`)
console.log(r.rows)
await pg.end()
