import { Client } from 'pg'

const client = new Client({
  connectionString: `postgresql://postgres:that1arlecchino@db.pqvnjgyqbxlylawwogjv.supabase.co:5432/postgres`,
  ssl: { rejectUnauthorized: false },
})
await client.connect()
const { rows } = await client.query(
  `SELECT u.id, u.email, p.full_name, p.role FROM auth.users u
   LEFT JOIN public.profiles p ON p.id = u.id
   WHERE u.email IN ('john.doe@example.com', 'lan.pham@localit.dev')
   ORDER BY u.email`,
)
console.log(JSON.stringify(rows, null, 2))
const { rows: pc } = await client.query(
  `SELECT id, status, caller_id, callee_id, created_at FROM pending_calls ORDER BY created_at DESC LIMIT 5`,
)
console.log('pending_calls:', JSON.stringify(pc, null, 2))
await client.end()