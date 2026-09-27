// scripts/fix-grants-otp.mjs
// Make sure service_role has full DML on email_verifications.
// Mirrors what scripts/fix-grants.mjs does for the rest of public.*.
import pg from 'pg'
const { Client } = pg

const c = new Client({
  connectionString: 'postgresql://postgres:that1arlecchino@db.pqvnjgyqbxlylawwogjv.supabase.co:5432/postgres',
  ssl: { rejectUnauthorized: false },
})
await c.connect()

await c.query(`
  GRANT USAGE ON SCHEMA public TO service_role;
  GRANT SELECT, INSERT, UPDATE, DELETE ON public.email_verifications TO service_role;
`)

const verify = await c.query(`
  SELECT grantee, privilege_type
  FROM information_schema.role_table_grants
  WHERE table_schema = 'public' AND table_name = 'email_verifications'
  ORDER BY grantee, privilege_type
`)
console.log('Grants on email_verifications:')
console.table(verify.rows)

await c.end()
