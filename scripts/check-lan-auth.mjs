import { Client } from 'pg'
const pg = new Client({
  connectionString: 'postgresql://postgres:that1arlecchino@db.pqvnjgyqbxlylawwogjv.supabase.co:5432/postgres',
  ssl: { rejectUnauthorized: false },
})
await pg.connect()
const r = await pg.query(`
  SELECT u.id, u.email, p.role
  FROM auth.users u
  JOIN public.profiles p ON p.id = u.id
  WHERE u.email LIKE '%lan%' OR u.email LIKE '%pham%' OR u.email LIKE '%john%'
`)
console.log(JSON.stringify(r.rows, null, 2))
await pg.end()
