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
    SELECT p.id, p.full_name, p.email
    FROM public.profiles p
    WHERE p.email IN ('john.doe@example.com', 'lan.pham@localit.dev')
  `)
  console.log('Profiles:', JSON.stringify(r.rows, null, 2))
  // Also check columns
  const cols = await c.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema='public' AND table_name='tourists'
    ORDER BY ordinal_position
  `)
  console.log('tourists columns:', cols.rows.map(c => c.column_name))
  const profCols = await c.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema='public' AND table_name='profiles'
    ORDER BY ordinal_position
  `)
  console.log('profiles columns:', profCols.rows.map(c => c.column_name))
  await c.end()
}
main().catch(e => { console.error(e); process.exit(1) })
