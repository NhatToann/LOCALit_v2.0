import { Client } from 'pg'
const c = new Client({
  connectionString: `postgresql://postgres:${process.env.SUPABASE_DB_PASSWORD}@db.pqvnjgyqbxlylawwogjv.supabase.co:5432/postgres`,
  ssl: { rejectUnauthorized: false },
})
await c.connect()
const p = await c.query("SELECT id, full_name, email, phone FROM public.profiles LIMIT 2")
console.log('profiles for service_role:')
console.log(JSON.stringify(p.rows, null, 2))

const t = await c.query("SELECT id, full_name FROM public.safe_profiles LIMIT 2")
console.log('safe_profiles:')
console.log(JSON.stringify(t.rows, null, 2))

const policies = await c.query(`
  SELECT schemaname, tablename, policyname, cmd, qual
  FROM pg_policies
  WHERE schemaname = 'public' AND tablename IN ('profiles','tourists','buddies')
  ORDER BY tablename, cmd
`)
console.log('policies on profiles/tourists/buddies:')
console.log(JSON.stringify(policies.rows, null, 2))

await c.end()
