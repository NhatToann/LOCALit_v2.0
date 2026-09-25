import { Client } from 'pg'
const c = new Client({
  connectionString: 'postgresql://postgres:that1arlecchino@db.pqvnjgyqbxlylawwogjv.supabase.co:5432/postgres',
  ssl: { rejectUnauthorized: false },
})
async function main() {
  await c.connect()
  const r = await c.query("SELECT u.id, u.email, p.full_name, p.role FROM auth.users u LEFT JOIN public.profiles p ON p.id = u.id WHERE u.email = $1", ['john.doe.tourist@gmail.com'])
  console.log('Auth+Profile:', r.rows)
  const r2 = await c.query("SELECT id, email FROM auth.users ORDER BY created_at")
  console.log('All auth users:', r2.rows)
  const r3 = await c.query("SELECT count(*) FROM public.profiles")
  console.log('Profile count:', r3.rows)
  await c.end()
}
main().catch(console.error)
