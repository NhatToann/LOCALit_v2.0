import { Client } from 'pg'
const c = new Client({
  connectionString: `postgresql://postgres:${process.env.DB_PW}@db.pqvnjgyqbxlylawwogjv.supabase.co:5432/postgres`,
  ssl: { rejectUnauthorized: false },
})
await c.connect()

// Verify service_role grants on the 4 tables
const grants = await c.query(`
  SELECT grantee, table_name, string_agg(privilege_type, ',' ORDER BY privilege_type) AS privs
  FROM information_schema.table_privileges
  WHERE table_schema='public'
    AND grantee='service_role'
    AND table_name IN ('trips','trip_stops','trip_days','trip_packing_items')
  GROUP BY grantee, table_name
  ORDER BY table_name
`)
console.log('service_role grants:')
console.log(JSON.stringify(grants.rows, null, 2))

// Verify triggers still intact
const triggers = await c.query(`
  SELECT tgname, tgrelid::regclass AS table_name
  FROM pg_trigger
  WHERE NOT tgisinternal
    AND tgrelid::regclass::text IN ('auth.users','public.profiles','public.trips','public.trip_stops')
  ORDER BY table_name, tgname
`)
console.log('\nTriggers (should include on_auth_user_created):')
console.log(JSON.stringify(triggers.rows, null, 2))

// Verify RLS still enabled
const rls = await c.query(`
  SELECT tablename, rowsecurity
  FROM pg_tables
  WHERE schemaname='public'
    AND tablename IN ('trips','trip_stops','trip_days','trip_packing_items')
  ORDER BY tablename
`)
console.log('\nRLS status:')
console.log(JSON.stringify(rls.rows, null, 2))

await c.end()
