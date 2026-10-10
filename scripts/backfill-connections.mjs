// Applies the connections requester/recipient backfill that
// 2026-10-10-backfill-connection-requester.sql intended to run.
// Idempotent — only touches rows where requester_id IS NULL.
import { Client } from 'pg'

const pg = new Client({
  host: 'db.pqvnjgyqbxlylawwogjv.supabase.co',
  port: 5432,
  user: 'postgres',
  password: process.env.DB_PW || process.env.SUPABASE_DB_PASSWORD || 'that1arlecchino',
  database: 'postgres',
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 15000,
})
await pg.connect()

const before = await pg.query(
  `SELECT count(*)::int AS total,
          count(*) FILTER (WHERE requester_id IS NULL)::int AS missing
   FROM public.connections`,
)
console.log('before:', before.rows[0])

// Only rows that have BOTH legacy columns can be backfilled.
const upd = await pg.query(
  `UPDATE public.connections
   SET requester_id = tourist_id,
       recipient_id = buddy_id,
       requester_role = 'tourist',
       recipient_role = 'buddy'
   WHERE requester_id IS NULL
     AND tourist_id IS NOT NULL
     AND buddy_id IS NOT NULL
   RETURNING id`,
)
console.log(`backfilled ${upd.rowCount} row(s)`)

const after = await pg.query(
  `SELECT count(*)::int AS total,
          count(*) FILTER (WHERE requester_id IS NULL)::int AS missing
   FROM public.connections`,
)
console.log('after:', after.rows[0])

// Any row we could NOT fix is surfaced loudly rather than silently ignored.
const stuck = await pg.query(
  `SELECT id, tourist_id, buddy_id, status::text FROM public.connections WHERE requester_id IS NULL`,
)
if (stuck.rowCount > 0) {
  console.log(`\nWARN: ${stuck.rowCount} row(s) still missing requester_id (need manual triage):`)
  console.table(stuck.rows)
} else {
  console.log('\nOK: every connection row has requester_id + recipient_id')
}

await pg.end()