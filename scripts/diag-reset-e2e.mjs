import { Client } from 'pg'
const c = new Client({
  host: 'db.pqvnjgyqbxlylawwogjv.supabase.co',
  port: 5432,
  user: 'postgres',
  password: 'that1arlecchino',
  database: 'postgres',
  ssl: { rejectUnauthorized: false },
})
await c.connect()
const { rows } = await c.query(
  "SELECT id, email, code_hash, expires_at, verified_at, consumed_at, attempts FROM public.email_verifications WHERE email=$1 ORDER BY created_at DESC LIMIT 1",
  ['darklunatv@gmail.com'],
)
console.log(JSON.stringify(rows, null, 2))
await c.end()
