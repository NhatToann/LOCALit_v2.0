import { Client } from 'pg'

const pw = process.env.SUPABASE_DB_PASSWORD || 'that1arlecchino'
const c = new Client({
  connectionString: `postgresql://postgres:${pw}@db.pqvnjgyqbxlylawwogjv.supabase.co:5432/postgres`,
  ssl: { rejectUnauthorized: false },
})
await c.connect()

// Remove the bogus OTP-only test accounts so the user can re-register with
// the owner's email (Resend sandbox only allows sender==recipient).
const emails = ['otp.test.danang.2026@gmail.com', 'otpverify2026@gmail.com']
for (const email of emails) {
  const { rows } = await c.query('SELECT id FROM auth.users WHERE email = $1', [email])
  const id = rows[0]?.id
  if (!id) continue
  // order: email_verifications → profiles (FK from tourists/buddies)
  await c.query('DELETE FROM email_verifications WHERE user_id = $1', [id])
  // Cascade: public.profiles ON DELETE CASCADE → tourist/buddies rows.
  await c.query('DELETE FROM auth.identities WHERE user_id = $1', [id])
  await c.query('DELETE FROM auth.users WHERE id = $1', [id])
  console.log('deleted', email)
}

// Verify
const { rows: remaining } = await c.query(
  "SELECT email, email_confirmed_at FROM auth.users WHERE email LIKE 'otp%' ORDER BY created_at DESC",
)
console.log('remaining otp* users:', JSON.stringify(remaining))

await c.end()
