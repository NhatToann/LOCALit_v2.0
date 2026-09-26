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
  // Column-level grants on buddies
  const r = await c.query(`
    SELECT grantee, column_name, privilege_type
    FROM information_schema.role_column_grants
    WHERE table_schema='public' AND table_name='buddies'
    ORDER BY grantee, column_name
  `)
  console.log('=== buddies column grants ===')
  for (const row of r.rows) console.log(`  ${row.grantee}.${row.column_name} = ${row.privilege_type}`)

  // Anonymous SELECT test
  console.log('\n=== Switch to authenticated ===')
  const ar = await c.query(`
    SELECT grantee, column_name, privilege_type
    FROM information_schema.role_column_grants
    WHERE table_schema='public' AND table_name='buddies'
      AND grantee = 'authenticated'
    ORDER BY column_name
  `)
  for (const row of ar.rows) console.log(`  authenticated.${row.column_name} = ${row.privilege_type}`)

  // anon
  console.log('\n=== Switch to anon ===')
  const an = await c.query(`
    SELECT grantee, column_name, privilege_type
    FROM information_schema.role_column_grants
    WHERE table_schema='public' AND table_name='buddies'
      AND grantee = 'anon'
    ORDER BY column_name
  `)
  for (const row of an.rows) console.log(`  anon.${row.column_name} = ${row.privilege_type}`)

  await c.end()
}
main().catch(e => { console.error(e); process.exit(1) })
