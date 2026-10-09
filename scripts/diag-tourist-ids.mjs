import pg from 'pg'
const { Client } = pg
const c = new Client({
  connectionString: `postgresql://postgres:${process.env.DB_PW}@db.pqvnjgyqbxlylawwogjv.supabase.co:5432/postgres`,
  ssl: { rejectUnauthorized: false },
})
await c.connect()
const r = await c.query(`
  SELECT p.id, p.full_name, p.email, p.role FROM public.profiles p
  JOIN public.tourists t ON t.id = p.id
  WHERE p.role = 'tourist'
  ORDER BY p.full_name
`)
console.log('All tourists:')
for (const row of r.rows) console.log(' ', row.email, row.id, row.full_name)
await c.end()
