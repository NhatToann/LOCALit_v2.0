import { Client } from 'pg'
const c = new Client({
  host: 'db.pqvnjgyqbxlylawwogjv.supabase.co',
  port: 5432,
  user: 'postgres',
  password: 'that1arlecchino',
  database: 'postgres',
  ssl: { rejectUnauthorized: false },
})
async function main() {
  await c.connect()
  const fOwn = await c.query(`
    SELECT p.proname, r.rolname AS owner
    FROM pg_proc p
    JOIN pg_roles r ON r.oid = p.proowner
    WHERE p.proname = 'handle_new_user'
  `)
  console.log('handle_new_user owner:', fOwn.rows[0])

  // Check who can insert into profiles
  const profPriv = await c.query(`
    SELECT grantee, privilege_type
    FROM information_schema.role_table_grants
    WHERE table_schema='public' AND table_name='profiles' AND grantee IN ('supabase_auth_admin','anon','authenticated','service_role')
  `)
  console.log('profiles grants:', profPriv.rows)

  // verify trigger
  const tg = await c.query("SELECT tgname, tgrelid::regclass FROM pg_trigger WHERE tgname='on_auth_user_created'")
  console.log('trigger:', tg.rows)

  // Try simulate: see if insert as supabase_auth_admin would work
  await c.query("SET ROLE supabase_auth_admin")
  console.log('after SET ROLE:', (await c.query("SELECT current_user")).rows)
  await c.query("RESET ROLE")

  await c.end()
}
main().catch(e => { console.error(e.message); process.exit(1) })
