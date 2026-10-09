// scripts/list-seed-users.mjs
import pg from 'pg'
const { Client } = pg
const c = new Client({
  connectionString: `postgresql://postgres:${process.env.DB_PW}@db.pqvnjgyqbxlylawwogjv.supabase.co:5432/postgres`,
  ssl: { rejectUnauthorized: false },
})
await c.connect()
const r = await c.query(`
  SELECT p.id, p.email, p.full_name, p.role
  FROM public.profiles p
  ORDER BY p.role, p.email
`)
for (const row of r.rows) console.log(`  ${row.role.padEnd(8)} ${row.email.padEnd(36)} ${row.full_name}`)
await c.end()
