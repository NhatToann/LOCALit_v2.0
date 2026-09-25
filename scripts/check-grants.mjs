import { Client } from 'pg'
const c = new Client({
  connectionString: 'postgresql://postgres:that1arlecchino@db.pqvnjgyqbxlylawwogjv.supabase.co:5432/postgres',
  ssl: { rejectUnauthorized: false },
})
async function main() {
  await c.connect()
  const tables = ['profiles', 'tourists', 'buddies', 'trips', 'connections', 'conversations', 'messages', 'reviews', 'location_updates', 'test_items']
  for (const t of tables) {
    const r = await c.query(
      `SELECT grantee, privilege_type FROM information_schema.role_table_grants WHERE table_name = $1 AND grantee IN ('anon', 'authenticated', 'service_role') ORDER BY grantee, privilege_type`,
      [t]
    )
    console.log(`\n[${t}]`)
    if (r.rows.length === 0) {
      console.log('  (no grants)')
    } else {
      r.rows.forEach(row => console.log(`  ${row.grantee}: ${row.privilege_type}`))
    }
  }
  await c.end()
}
main().catch(console.error)
