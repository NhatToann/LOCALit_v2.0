import { Client } from 'pg';
import bcrypt from 'bcryptjs';

const BASE = 'https://localit-3qu36msik-nhattoann.vercel.app'
const BYPASS = 'w6XAcwiXyFf9Pea8I6zwVONXAhc8Xs9A'

const db = new Client({
  connectionString: 'postgresql://postgres:that1arlecchino@db.pqvnjgyqbxlylawwogjv.supabase.co:5432/postgres',
  ssl: { rejectUnauthorized: false },
});
await db.connect();

const EMAIL = `e2e.fix2.${Date.now()}@gmail.com`
console.log('Email:', EMAIL)

const r = await fetch(`${BASE}/api/auth/signup/start`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'x-vercel-protection-bypass': BYPASS },
  body: JSON.stringify({ email: EMAIL, password: 'TestPass123!', fullName: 'E2E Fix2' }),
})
const data = await r.json().catch(() => ({}))
console.log('[start]', r.status, JSON.stringify(data))
if (!r.ok) process.exit(1)
const signupId = data.signupId

// Wait briefly, then check DB
await new Promise(r => setTimeout(r, 500))
const { rows: rows1 } = await db.query(`SELECT id, email FROM public.email_verifications WHERE id = $1`, [signupId])
console.log('After start, DB row:', JSON.stringify(rows1))

// Replace code hash and verify
const TEST_CODE = '111111'
const codeHash = await bcrypt.hash(TEST_CODE, 10)
const { error: upErr } = await db.query(
  `UPDATE public.email_verifications SET code_hash = $1, verified_at = NOW(), attempts = 0 WHERE id = $2`,
  [codeHash, signupId],
)
console.log('DB update error:', upErr?.message || 'none')

const { rows: rows2 } = await db.query(`SELECT id, email, verified_at FROM public.email_verifications WHERE id = $1`, [signupId])
console.log('After update, DB row:', JSON.stringify(rows2))

// Now hit verify-otp
const vr = await fetch(`${BASE}/api/auth/signup/verify-otp`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'x-vercel-protection-bypass': BYPASS },
  body: JSON.stringify({ signupId, code: TEST_CODE }),
})
const vdata = await vr.json().catch(() => ({}))
console.log('[verify-otp]', vr.status, JSON.stringify(vdata))

await db.end();