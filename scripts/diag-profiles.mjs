import pg from 'pg'
const {Client} = pg
const c = new Client({
  connectionString: `postgresql://postgres:${process.env.DB_PW}@db.pqvnjgyqbxlylawwogjv.supabase.co:5432/postgres`,
  ssl: { rejectUnauthorized: false }
})
await c.connect()
const r = await c.query(`
  SELECT p.id, p.full_name, p.email, p.role
  FROM public.profiles p
  ORDER BY p.email
`)
console.log('profiles:')
for (const row of r.rows) console.log(' ', row.role, row.email, row.full_name, row.id)
await c.end()
