import { Client } from 'pg'
import { setTimeout as sleep } from 'node:timers/promises'
const HOST = 'db.pqvnjgyqbxlylawwogjv.supabase.co'
const PORT = 5432
const DB_USER = 'postgres'
const DB_NAME = 'postgres'
const DB_PW = process.env.DB_PW || 'that1arlecchino'
;(async () => {
  const pg = new Client({ host: HOST, port: PORT, user: DB_USER, password: DB_PW, database: DB_NAME, ssl: { rejectUnauthorized: false } })
  await pg.connect()

  // Test multiple signup attempts and see exactly when GoTrue fails.
  const beforeCount = await pg.query('SELECT COUNT(*)::int AS c FROM auth.users')
  console.log('users before:', beforeCount.rows[0].c)

  const newEmail = 'multitest-' + Date.now() + '@localit-test.dev'

  // Attempt 1: anonymous REST signup
  console.log('\n--- Attempt 1: anon REST POST /auth/v1/signup ---')
  const r1 = await fetch('https://pqvnjgyqbxlylawwogjv.supabase.co/auth/v1/signup', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': 'sb_publishable_3uRUZqdvazd4cENt8WOWJA_SB7HmCEE',
      'Authorization': 'Bearer sb_publishable_3uRUZqdvazd4cENt8WOWJA_SB7HmCEE',
    },
    body: JSON.stringify({
      email: newEmail, password: 'TestPass-1234',
      data: { full_name: 'Multi Test', role: 'tourist' },
    }),
  })
  console.log('  status:', r1.status)
  const b1 = await r1.json()
  console.log('  body:', JSON.stringify(b1).substring(0, 400))

  // Did the row get created?
  const after = await pg.query("SELECT id, email FROM auth.users WHERE email = $1", [newEmail])
  console.log('  row created:', after.rows.length > 0 ? 'YES' : 'NO', after.rows[0] || '')

  if (after.rows.length === 0) {
    // Try direct INSERT as fallback to confirm trigger still works
    console.log('\n--- Fallback: direct pg insert (bypass GoTrue) ---')
    const TEST_ID = 'deadbeef-cafe-fade-babe-' + Date.now().toString(16).padStart(12, '0')
    const email2 = 'direct-' + Date.now() + '@localit-test.dev'
    try {
      await pg.query(`INSERT INTO auth.users (
        instance_id, id, aud, role, email,
        encrypted_password, email_confirmed_at,
        raw_app_meta_data, raw_user_meta_data,
        created_at, updated_at,
        confirmation_token, email_change, email_change_token_new, recovery_token,
        email_change_token_current, reauthentication_token,
        phone_change, phone_change_token,
        is_anonymous, is_sso_user, email_change_confirm_status
      ) VALUES (
        '00000000-0000-0000-0000-000000000000', $1, 'authenticated', 'authenticated', $2,
        crypt('TestPass-1234', gen_salt('bf')), now(),
        '{"provider":"email","providers":["email"]}'::jsonb,
        '{"full_name":"Direct Test","role":"tourist"}'::jsonb,
        now(), now(), '', '', '', '', '', '', '', '', false, false, 0
      )`, [TEST_ID, email2])
      await sleep(800)
      const prof = await pg.query(`SELECT id, role FROM public.profiles WHERE id = $1`, [TEST_ID])
      console.log('  profile created:', prof.rows.length > 0 ? 'YES' : 'NO', prof.rows[0] || '')
      await pg.query('DELETE FROM public.profiles WHERE id = $1', [TEST_ID])
      await pg.query('DELETE FROM auth.users WHERE id = $1', [TEST_ID])
    } catch (e) {
      console.log('  direct insert FAILED:', e.message)
    }
  }

  await pg.end()
})()
