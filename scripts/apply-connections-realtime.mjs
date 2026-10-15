// scripts/apply-connections-realtime.mjs
//
// Idempotent: applies the migration that adds public.connections to
// the supabase_realtime publication. Re-running is safe — the ALTER
// PUBLICATION ... ADD TABLE statement is a no-op if the table is
// already in the publication.
import { Client } from 'pg'

const conn = process.env.SUPABASE_DB_URL
  || 'postgresql://postgres:that1arlecchino@db.pqvnjgyqbxlylawwogjv.supabase.co:5432/postgres'

const c = new Client({ connectionString: conn, ssl: { rejectUnauthorized: false } })
await c.connect()
try {
  const r = await c.query(
    "SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'connections'",
  )
  if (r.rowCount && r.rowCount > 0) {
    console.log('connections already in supabase_realtime — nothing to do')
  } else {
    await c.query('ALTER PUBLICATION supabase_realtime ADD TABLE public.connections')
    console.log('OK — added public.connections to supabase_realtime')
  }
} finally {
  await c.end()
}
