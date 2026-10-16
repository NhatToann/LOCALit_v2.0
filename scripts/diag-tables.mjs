import { Client } from 'pg'
const c = new Client({ connectionString: 'postgresql://postgres:that1arlecchino@db.pqvnjgyqbxlylawwogjv.supabase.co:5432/postgres', ssl: { rejectUnauthorized: false } })
await c.connect()
const { rows } = await c.query(`
  SELECT table_name FROM information_schema.tables
  WHERE table_schema = 'public'
  ORDER BY table_name
`)
console.log('public tables:')
for (const r of rows) console.log('  ' + r.table_name)
await c.end()
