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
    SELECT table_name, grantee, string_agg(privilege_type, ', ' ORDER BY privilege_type) AS perms
    FROM information_schema.role_table_grants
    WHERE table_schema='public' AND table_name IN ('messages','trip_stops') AND grantee IN ('authenticated','anon')
    GROUP BY table_name, grantee
  `)
  for (const row of r.rows) console.log(`${row.table_name}.${row.grantee} = ${row.perms}`)
  await c.end()
}
main().catch(e => { console.error(e); process.exit(1) })
