import { Client } from 'pg'
const c = new Client({
  connectionString: 'postgresql://postgres:that1arlecchino@db.pqvnjgyqbxlylawwogjv.supabase.co:5432/postgres',
  ssl: { rejectUnauthorized: false },
})
async function main() {
  await c.connect()
  const r = await c.query(`SELECT schemaname, tablename, policyname, cmd, qual, with_check FROM pg_policies WHERE tablename = 'profiles' ORDER BY policyname`)
  console.log('Policies on profiles:')
  r.rows.forEach(p => console.log(`  [${p.cmd}] ${p.policyname}: USING=${p.qual} CHECK=${p.with_check}`))
  await c.end()
}
main().catch(console.error)
