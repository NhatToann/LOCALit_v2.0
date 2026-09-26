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
  const types = await c.query("SELECT n.nspname, t.typname FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace WHERE t.typname = 'user_role'")
  console.log('user_role type:', types.rows)
  const prof = await c.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name='profiles' AND column_name='role'")
  console.log('profiles.role column:', prof.rows)
  await c.end()
}
main().catch(e => { console.error(e.message); process.exit(1) })
