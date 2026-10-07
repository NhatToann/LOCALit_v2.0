import { Client } from 'pg'
const c = new Client({
  connectionString: 'postgresql://postgres:that1arlecchino@db.pqvnjgyqbxlylawwogjv.supabase.co:5432/postgres',
  ssl: { rejectUnauthorized: false },
})
await c.connect()
const { rows: tables } = await c.query(`
  SELECT schemaname, tablename FROM pg_publication_tables
  WHERE pubname = 'supabase_realtime'
`)
console.log('supabase_realtime publication tables:', tables)
const { rows: def } = await c.query(`
  SELECT pubname, pubdef
  FROM pg_catalog.pg_publication WHERE pubname = 'supabase_realtime'
`)
console.log('publication def:', def)
await c.end()