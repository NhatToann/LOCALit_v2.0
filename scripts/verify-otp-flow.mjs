import { Client } from 'pg'

const pw = process.env.SUPABASE_DB_PASSWORD || 'that1arlecchino'
const c = new Client({
  connectionString: `postgresql://postgres:${pw}@db.pqvnjgyqbxlylawwogjv.supabase.co:5432/postgres`,
  ssl: { rejectUnauthorized: false },
})
await c.connect()

const { rows } = await c.query(
  "SELECT id, email, email_confirmed_at, created_at FROM auth.users WHERE email IN ($1, $2, $3) ORDER BY created_at DESC",
  ['darklunatv@gmail.com', 'otpverify2026@gmail.com', 'otp.test.danang.2026@gmail.com'],
)
console.log(JSON.stringify(rows, null, 2))

const { rows: codes } = await c.query(
  "SELECT id, user_id, attempts, consumed_at IS NOT NULL AS consumed, expires_at FROM email_verifications ORDER BY created_at DESC LIMIT 6",
)
console.log('--- email_verifications ---')
console.log(JSON.stringify(codes, null, 2))

await c.end()
