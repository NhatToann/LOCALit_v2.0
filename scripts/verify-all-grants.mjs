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
  const tables = ['trips', 'trip_stops', 'connections', 'conversations', 'messages', 'reviews', 'profiles', 'tourists', 'buddies']
  for (const t of tables) {
    const r = await c.query(`
      SELECT grantee, string_agg(privilege_type, ', ' ORDER BY privilege_type) AS perms
      FROM information_schema.role_table_grants
      WHERE table_schema='public' AND table_name=$1 AND grantee IN ('authenticated','anon','service_role')
      GROUP BY grantee
    `, [t])
    for (const row of r.rows) console.log(`  ${t}.${row.grantee} = ${row.perms}`)
  }
  await c.end()
}
main().catch(e => { console.error(e); process.exit(1) })
