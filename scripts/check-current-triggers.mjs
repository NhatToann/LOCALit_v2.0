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
  const tg = await c.query("SELECT tgname FROM pg_trigger WHERE tgrelid='auth.users'::regclass AND NOT tgisinternal")
  console.log('Triggers on auth.users:', JSON.stringify(tg.rows))
  const fn = await c.query("SELECT proname FROM pg_proc WHERE proname='handle_new_user'")
  console.log('handle_new_user fn exists?', fn.rows.length > 0)
  await c.end()
}
main().catch(e => { console.error(e.message); process.exit(1) })
