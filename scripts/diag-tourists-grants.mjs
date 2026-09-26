import { Client } from 'pg'
const HOST = 'db.pqvnjgyqbxlylawwogjv.supabase.co'
const PORT = 5432
const USER = 'postgres'
const DB = 'postgres'
const PW = process.env.DB_PW || 'that1arlecchino'
;(async () => {
  const c = new Client({ host: HOST, port: PORT, user: USER, password: PW, database: DB, ssl: { rejectUnauthorized: false } })
  await c.connect()
  const r = await c.query(`
    SELECT n.nspname AS schema, c.relname AS table,
           c.relrowsecurity AS rls_enabled,
           c.relforcerowsecurity AS rls_forced
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname='public' AND c.relname IN ('tourists','buddies','profiles','connections','trips','conversations','messages','reviews','location_updates','trip_stops')
    ORDER BY c.relname
  `)
  for (const row of r.rows) console.log(JSON.stringify(row))

  const grants = await c.query(`
    SELECT table_name, grantee, string_agg(privilege_type, ',' ORDER BY privilege_type) AS privs
    FROM information_schema.role_table_grants
    WHERE table_schema='public' AND table_name IN ('tourists','buddies','profiles')
      AND grantee IN ('service_role','supabase_admin','supabase_auth_admin')
    GROUP BY table_name, grantee
    ORDER BY table_name, grantee
  `)
  console.log('---grants to service-like roles---')
  for (const row of grants.rows) console.log(JSON.stringify(row))

  const roles = await c.query(`SELECT rolname FROM pg_roles WHERE rolname IN ('service_role','supabase_admin','supabase_auth_admin','authenticated','anon','postgres') ORDER BY rolname`)
  console.log('---roles present---')
  for (const row of roles.rows) console.log(JSON.stringify(row))

  await c.end()
})().catch(e => { console.error(e); process.exit(1) })