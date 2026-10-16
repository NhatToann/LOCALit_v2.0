// Force a row into verified state for UI testing. We:
//   1. Issue /start (returns signupId) without OTP_PREVIEW
//   2. Directly UPDATE the row in DB to set verified_at
//   3. Drive the UI: /verify-otp will accept any code because we never
//      compare against a real code_hash... actually it will reject. So
//      instead we set code_hash to bcrypt('111111') so the test code works.
//
// For the SessionTimer UI screenshot test, simpler: I'll manually insert
// a row, manually verify it, and then drive the register page with
// sessionStorage-signupId via direct manipulation of React state.
//
// Actually simplest: just verify the SessionTimer renders when a real
// user does the flow. We can simulate by:
//   - /start (gets signupId)
//   - Manually patch DB to set verified_at + a code_hash for "111111"
//   - /verify-otp { signupId, code: "111111" } → returns expiresAt
//   - UI advances to Step 3 with SessionTimer ticking.
import { Client } from 'pg';
import bcrypt from 'bcryptjs';

const email = process.argv[2];
if (!email) {
  console.error('Usage: node scripts/force-verify-signup.mjs <email>');
  process.exit(1);
}

const c = new Client({
  connectionString: 'postgresql://postgres:that1arlecchino@db.pqvnjgyqbxlylawwogjv.supabase.co:5432/postgres',
  ssl: { rejectUnauthorized: false },
});
await c.connect();

// Find the most-recent unconsumed row for that email
const sel = await c.query(`
  SELECT id FROM public.email_verifications
  WHERE email = $1 AND consumed_at IS NULL
  ORDER BY created_at DESC LIMIT 1
`, [email]);
if (sel.rows.length === 0) {
  console.error('No active signup row for', email);
  process.exit(1);
}
const signupId = sel.rows[0].id;
const codeHash = await bcrypt.hash('111111', 10);
const r = await c.query(`
  UPDATE public.email_verifications
  SET code_hash = $2,
      verified_at = NOW(),
      expires_at = NOW() + INTERVAL '15 minutes'
  WHERE id = $1
  RETURNING id, email, verified_at, expires_at
`, [signupId, codeHash]);
console.log('forced-verify result:', JSON.stringify(r.rows, null, 2));
await c.end();
console.log('signupId:', signupId);