// scripts/diag-redteam-rls.mjs
// Check RLS state + grants for public tables
import { Client } from 'pg'
const c = new Client({
  connectionString: `postgresql://postgres:${process.env.DB_PW}@db.pqvnjgyqbxlylawwogjv.supabase.co:5432/postgres`,
  ssl: { rejectUnauthorized: false },
})
await c.connect()
console.log('=== RLS enabled ===')
console.log(await (await c.query("SELECT schemaname, tablename, rowsecurity FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows)
console.log('\n=== Policies (anon + authenticated) ===')
console.log(await (await c.query(`SELECT schemaname, tablename, policyname, roles, cmd, qual::text, with_check::text FROM pg_policies WHERE schemaname='public' ORDER BY tablename, policyname`)).rows)
console.log('\n=== Privileges for anon role ===')
console.log(await (await c.query(`SELECT grantee, table_name, privilege_type FROM information_schema.role_table_grants WHERE grantee='anon' AND table_schema='public' ORDER BY table_name, privilege_type`)).rows)
console.log('\n=== Privileges for authenticated role ===')
console.log(await (await c.query(`SELECT grantee, table_name, privilege_type FROM information_schema.role_table_grants WHERE grantee='authenticated' AND table_schema='public' ORDER BY table_name, privilege_type`)).rows)
console.log('\n=== Privileges for service_role ===')
console.log(await (await c.query(`SELECT grantee, table_name, privilege_type FROM information_schema.role_table_grants WHERE grantee='service_role' AND table_schema='public' ORDER BY table_name, privilege_type`)).rows)
await c.end()
