// Idempotent: GRANT table-level privileges to service_role on all
// public schema tables. Supabase Cloud does NOT auto-grant to service_role,
// so admin routes that call .from(table).upsert/insert via PostgREST fail
// with "permission denied for table X".
//
// Run with: node scripts/fix-grants.mjs
import { Client } from 'pg'

const HOST = 'db.pqvnjgyqbxlylawwogjv.supabase.co'
const PORT = 5432
const USER = 'postgres'
const DB = 'postgres'
const PW = process.env.DB_PW || 'that1arlecchino'

const TABLES = [
  'profiles', 'tourists', 'buddies',
  'connections', 'trips', 'trip_stops',
  'conversations', 'messages', 'reviews', 'location_updates',
  'email_verifications',
]

;(async () => {
  const c = new Client({ host: HOST, port: PORT, user: USER, password: PW, database: DB, ssl: { rejectUnauthorized: false } })
  await c.connect()
  for (const table of TABLES) {
    const sql = `GRANT INSERT, UPDATE, SELECT, DELETE ON public.${table} TO service_role;`
    try {
      await c.query(sql)
      console.log('  GRANT OK:', table)
    } catch (e) {
      // Table may not exist yet (email_verifications is new) — that's fine.
      if (e.code === '42P01') {
        console.log('  SKIP (table missing):', table)
      } else {
        console.error('  GRANT FAIL:', table, e.message)
        throw e
      }
    }
  }
  await c.end()
  console.log('Done.')
})().catch(e => { console.error('FATAL:', e.message); process.exit(1) })