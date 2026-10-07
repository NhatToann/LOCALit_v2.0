import { Client } from 'pg'
const c = new Client({
  connectionString: 'postgresql://postgres:that1arlecchino@db.pqvnjgyqbxlylawwogjv.supabase.co:5432/postgres',
  ssl: { rejectUnauthorized: false },
})
await c.connect()
const signupId = process.argv[2]
if (!signupId) {
  console.error('usage: node scripts/get-otp.mjs <signupId>')
  process.exit(1)
}
const { rows } = await c.query(
  `SELECT id, email, code_hash, verified_at, expires_at, attempts, consumed_at
   FROM public.email_verifications
   WHERE id = $1`,
  [signupId],
)
console.log(JSON.stringify(rows, null, 2))
await c.end()