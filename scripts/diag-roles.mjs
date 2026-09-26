import { Client } from 'pg'
const HOST = 'db.pqvnjgyqbxlylawwogjv.supabase.co'
const PORT = 5432
const DB_USER = 'postgres'
const DB_NAME = 'postgres'
const DB_PW = process.env.DB_PW || 'that1arlecchino'
;(async () => {
  const pg = new Client({ host: HOST, port: PORT, user: DB_USER, password: DB_PW, database: DB_NAME, ssl: { rejectUnauthorized: false } })
  await pg.connect()
  // Look for any auth-relevant functions & their setting user
  const r = await pg.query(`
    SELECT rolname FROM pg_roles
    WHERE rolname NOT LIKE 'pg_%'
      AND rolname NOT IN ('postgres','supabase_admin','supabase_auth_admin','supabase_storage_admin',
                          'dashboard_user','pgbouncer','authenticatormock')
  `)
  console.log('Roles:')
  r.rows.forEach(x => console.log(' -', x.rolname))

  // Check if there's a role that GoTrue uses
  try {
    const r2 = await pg.query(`
      SELECT grantee, table_schema, table_name, privilege_type
      FROM information_schema.role_table_grants
      WHERE table_schema = 'auth'
        AND grantee NOT IN ('postgres')
      ORDER BY grantee, table_name
    `)
    console.log('Non-postgres auth grants:')
    r2.rows.forEach(x => console.log(' -', x.grantee, x.table_name, x.privilege_type))
  } catch (e) { console.error(e.message) }

  // Check what user PostgREST runs as
  try {
    const r3 = await pg.query("SELECT current_user, session_user")
    console.log('Current:', r3.rows[0])
  } catch (e) { console.error(e.message) }

  // List check constraints on auth.users that might be blocking inserts
  try {
    const r4 = await pg.query(`
      SELECT conname, pg_get_constraintdef(oid)
      FROM pg_constraint
      WHERE conrelid = 'auth.users'::regclass
        AND contype = 'c'
    `)
    console.log('auth.users check constraints:')
    r4.rows.forEach(x => console.log(' -', x.conname, ':', x.pg_get_constraintdef))
  } catch (e) { console.error(e.message) }

  await pg.end()
})()
