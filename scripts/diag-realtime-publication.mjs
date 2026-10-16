// diag-realtime-publication.mjs — verify that `notifications` is in supabase_realtime publication
import { Client } from 'pg'
const c = new Client({
  connectionString: 'postgresql://postgres:that1arlecchino@db.pqvnjgyqbxlylawwogjv.supabase.co:5432/postgres',
  ssl: { rejectUnauthorized: false },
})
await c.connect()
try {
  const pub = await c.query(`
    SELECT p.pubname, p.puballtables,
           array_agg(pt.schemaname || '.' || pt.tablename ORDER BY pt.schemaname, pt.tablename) AS tables
    FROM pg_publication p
    LEFT JOIN pg_publication_tables pt ON pt.pubname = p.pubname
    GROUP BY p.pubname, p.puballtables
  `)
  console.log('=== publications ===')
  console.table(pub.rows.map(r => ({ pubname: r.pubname, puballtables: r.puballtables, table_count: r.tables.length, tables: r.tables.join(', ') })))

  // Specifically: is `public.notifications` in the supabase_realtime publication?
  const has = await c.query(`
    SELECT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'notifications'
    ) AS in_publication
  `)
  console.log('public.notifications in supabase_realtime?', has.rows[0].in_publication)

  // Check RLS — does SELECT policy actually allow the user to read their rows?
  const pol = await c.query(`
    SELECT policyname, cmd, qual
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'notifications' AND cmd = 'SELECT'
  `)
  console.log('=== SELECT policy on notifications ===')
  console.table(pol.rows.map(r => ({ policyname: r.policyname, cmd: r.cmd, qual: r.qual })))
} catch (e) {
  console.error('ERR:', e.message)
} finally {
  await c.end()
}
