// Test if Supabase Realtime is enabled at the project level.
// Realtime POST /api/v1/realtime endpoint may not exist; check via direct WS handshake.

import { Client } from 'pg'
const c = new Client({
  connectionString: 'postgresql://postgres:that1arlecchino@db.pqvnjgyqbxlylawwogjv.supabase.co:5432/postgres',
  ssl: { rejectUnauthorized: false },
})
await c.connect()
const { rows } = await c.query(`
  SELECT extname, extnamespace::regnamespace AS schema
  FROM pg_extension WHERE extname = 'pg_stat_statements'`)
console.log('extensions:', rows)

const { rows: pubs } = await c.query(`
  SELECT pubname FROM pg_publication`)
console.log('publications:', pubs)

const { rows: t } = await c.query(`
  SELECT n.nspname, c.relname
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE c.relname IN ('subscription', 'realtime', 'messages')
    AND n.nspname = 'supabase_realtime'`)
console.log('realtime tables:', t)
await c.end()