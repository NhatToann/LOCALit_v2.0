// Fetch the most-recent unverified signup row's email and signupId so we
// can drive the /verify-otp endpoint with the matching code (which we have
// to retrieve via Supabase admin or by re-issuing in dev mode).
//
// For production testing, the alternative is: set OTP_PREVIEW=true in
// Vercel env vars, then __devCode comes back in the API response. This
// script prints what to do in each case.
import { Client } from 'pg';

const target = process.argv[2];
if (!target) {
  console.error('Usage: node scripts/get-signupid.mjs <email>');
  process.exit(1);
}

const c = new Client({
  connectionString: 'postgresql://postgres:that1arlecchino@db.pqvnjgyqbxlylawwogjv.supabase.co:5432/postgres',
  ssl: { rejectUnauthorized: false },
});
await c.connect();

const r = await c.query(`
  SELECT id, email, expires_at, verified_at, consumed_at, attempts, created_at
  FROM public.email_verifications
  WHERE email = $1
  ORDER BY created_at DESC LIMIT 5
`, [target]);
console.log('rows:', JSON.stringify(r.rows, null, 2));
await c.end();