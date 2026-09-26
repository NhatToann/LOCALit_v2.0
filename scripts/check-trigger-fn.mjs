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
  const r = await c.query(`
    SELECT
      p.proname,
      CASE WHEN p.prosecdef THEN 'SECURITY DEFINER' ELSE 'SECURITY INVOKER' END AS security_mode,
      pg_get_functiondef(p.oid) AS definition
    FROM pg_proc p
    WHERE p.proname IN ('handle_new_user')
  `)
  for (const row of r.rows) {
    console.log('---', row.proname, '/', row.security_mode, '---')
    console.log(row.definition)
    console.log()
  }
  await c.end()
}
main().catch(e => { console.error(e.message); process.exit(1) })
