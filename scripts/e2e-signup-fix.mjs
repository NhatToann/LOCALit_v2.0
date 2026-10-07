import { Client } from 'pg';
import bcrypt from 'bcryptjs';

const BASE = 'https://localit-3qu36msik-nhattoann.vercel.app'
const BYPASS = 'w6XAcwiXyFf9Pea8I6zwVONXAhc8Xs9A'

const db = new Client({
  connectionString: 'postgresql://postgres:that1arlecchino@db.pqvnjgyqbxlylawwogjv.supabase.co:5432/postgres',
  ssl: { rejectUnauthorized: false },
});
await db.connect();

const EMAIL = `e2e.fix.${Date.now()}@gmail.com`
console.log('=== Email:', EMAIL, '===')

console.log('\n=== Step 1: POST /signup/start ===')
let r = await fetch(`${BASE}/api/auth/signup/start`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'x-vercel-protection-bypass': BYPASS },
  body: JSON.stringify({ email: EMAIL, password: 'TestPass123!', fullName: 'E2E Fix Test' }),
})
let data = await r.json().catch(() => ({}))
console.log(`[start] ${r.status}`, JSON.stringify(data, null, 2))
if (!r.ok) { console.error('start failed'); process.exit(1) }
const signupId = data.signupId

console.log('\n=== Step 2: Mark verified_at in DB + replace code_hash for code 111111 ===')
const TEST_CODE = '111111'
const codeHash = await bcrypt.hash(TEST_CODE, 10)
const { error: upErr } = await db.query(
  `UPDATE public.email_verifications SET code_hash = $1, verified_at = NOW(), attempts = 0 WHERE id = $2`,
  [codeHash, signupId],
)
if (upErr) { console.error('DB update failed:', upErr.message); process.exit(1) }
console.log('OK')

console.log('\n=== Step 3: POST /verify-otp ===')
r = await fetch(`${BASE}/api/auth/signup/verify-otp`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'x-vercel-protection-bypass': BYPASS },
  body: JSON.stringify({ signupId, code: TEST_CODE }),
})
data = await r.json().catch(() => ({}))
console.log(`[verify-otp] ${r.status}`, JSON.stringify(data))
if (!r.ok) { console.error('verify failed'); process.exit(1) }

console.log('\n=== Step 4: POST /complete ===')
r = await fetch(`${BASE}/api/auth/signup/complete`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'x-vercel-protection-bypass': BYPASS },
  body: JSON.stringify({
    signupId, role: 'tourist',
    profilePayload: {
      nationality: 'United States',
      travel_style: 'solo',
      interests: ['food'],
      languages: ['English'],
      budget_range: '50-100',
      destination: 'Da Nang',
    },
  }),
})
data = await r.json().catch(() => ({}))
console.log(`[complete] ${r.status}`, JSON.stringify(data, null, 2))
if (!r.ok) { console.error('complete failed'); process.exit(1) }

console.log('\n=== Step 5: Verify in DB ===')
const { rows: profiles } = await db.query(
  `SELECT p.id, p.email, p.full_name, p.role, t.nationality, t.languages, t.interests FROM public.profiles p LEFT JOIN public.tourists t ON t.id = p.id WHERE p.email = $1`,
  [EMAIL],
)
console.log('Profile:', JSON.stringify(profiles[0], null, 2))

const { rows: authUsers } = await db.query(
  `SELECT id, email, email_confirmed_at FROM auth.users WHERE email = $1`,
  [EMAIL],
)
console.log('auth.users:', JSON.stringify(authUsers[0], null, 2))

await db.end();