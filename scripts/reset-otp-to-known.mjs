import { Client } from 'pg'
import bcrypt from 'bcryptjs'

const c = new Client({
  connectionString: 'postgresql://postgres:that1arlecchino@db.pqvnjgyqbxlylawwogjv.supabase.co:5432/postgres',
  ssl: { rejectUnauthorized: false },
})
await c.connect()
const signupId = process.argv[2]
if (!signupId) {
  console.error('usage: node scripts/reset-otp-to-known.mjs <signupId>')
  process.exit(1)
}
// Replace code_hash with a known hash of "111111" so verify-otp succeeds.
const knownHash = await bcrypt.hash('111111', 10)
const { rowCount } = await c.query(
  `UPDATE public.email_verifications
   SET code_hash = $2,
     verified_at = NULL,
     consumed_at = NULL,
     attempts = 0,
     expires_at = NOW() + INTERVAL '15 minutes'
   WHERE id = $1`,
  [signupId, knownHash],
)
console.log('updated rows:', rowCount)
await c.end()