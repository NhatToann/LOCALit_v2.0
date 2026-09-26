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
    SELECT policyname, cmd, qual, with_check, roles::text
    FROM pg_policies
    WHERE schemaname='public' AND tablename='messages'
    ORDER BY cmd
  `)
  for (const row of r.rows) {
    console.log(`Policy: ${row.policyname} (${row.cmd})`)
    console.log(`  USING: ${row.qual}`)
    console.log(`  CHECK: ${row.with_check}`)
    console.log(`  roles: ${row.roles}`)
  }
  await c.end()
}
main().catch(e => { console.error(e); process.exit(1) })
