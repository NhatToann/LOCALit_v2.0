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
  const t = await c.query(`
    SELECT table_name, grantee, string_agg(privilege_type, ', ' ORDER BY privilege_type) AS perms
    FROM information_schema.role_table_grants
    WHERE table_schema='public'
      AND table_name IN ('messages','conversations','connections','trips','trip_stops','reviews','location_updates','profiles','tourists','buddies')
    GROUP BY table_name, grantee
    ORDER BY table_name, grantee
  `)
  console.log('Current grants:')
  for (const row of t.rows) console.log(`  ${row.table_name}.${row.grantee} = ${row.perms}`)

  console.log('\n--- RLS Policies ---')
  const p = await c.query(`
    SELECT tablename, policyname, cmd, roles::text, qual
    FROM pg_policies
    WHERE schemaname='public'
      AND tablename IN ('messages','conversations','connections','trips','trip_stops','reviews','location_updates')
    ORDER BY tablename, cmd
  `)
  for (const row of p.rows) console.log(`  ${row.tablename} ${row.cmd}: ${row.policyname} (roles=${row.roles})`)
  await c.end()
}
main().catch(e => { console.error(e.message); process.exit(1) })
