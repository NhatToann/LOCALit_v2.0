// Simulate a fresh signup via raw SQL through the postgres role (mirror
// what GoTrue does for /auth/v1/signup) to isolate whether the trigger is
// the cause of "Database error creating new user".
import { Client } from 'pg'
import crypto from 'node:crypto'

const c = new Client({
  host: 'db.pqvnjgyqbxlylawwogjv.supabase.co',
  port: 5432,
  user: 'postgres',
  password: 'that1arlecchino',
  database: 'postgres',
  ssl: { rejectUnauthorized: false },
})

const testEmail = `trigger-test-${Date.now()}@verify.local`

async function main() {
  await c.connect()
  const id = crypto.randomUUID()
  // Try insert directly as postgres (which has all perms)
  try {
    const r1 = await c.query(
      `INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
       VALUES ($1, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', $2, crypt($3, gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}'::jsonb, $4::jsonb)
       RETURNING id`,
      [id, testEmail, 'Test12345!', JSON.stringify({ full_name: 'Test', role: 'buddy' })]
    )
    console.log('Direct insert into auth.users:', r1.rowCount, 'rows -> id:', r1.rows[0]?.id)
  } catch (e) {
    console.error('Direct insert FAILED:', e.message)
  }

  // Check if profile was created by trigger
  await new Promise(r => setTimeout(r, 500))
  const prof = await c.query('SELECT id, email, role FROM public.profiles WHERE email = $1', [testEmail])
  console.log('Profile row created by trigger?', prof.rows.length > 0, prof.rows[0])

  // Clean up
  await c.query('DELETE FROM public.profiles WHERE email = $1', [testEmail])
  await c.query('DELETE FROM auth.users WHERE email = $1', [testEmail])

  await c.end()
}
main().catch(e => { console.error(e); process.exit(1) })
