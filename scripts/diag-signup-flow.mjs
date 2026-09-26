import { Client } from 'pg'
const HOST = 'db.pqvnjgyqbxlylawwogjv.supabase.co'
const PORT = 5432
const DB_USER = 'postgres'
const DB_NAME = 'postgres'
const DB_PW = process.env.DB_PW || 'that1arlecchino'
;(async () => {
  const pg = new Client({ host: HOST, port: PORT, user: DB_USER, password: DB_PW, database: DB_NAME, ssl: { rejectUnauthorized: false } })
  await pg.connect()

  // 1) Check if trigger exists
  const tr = await pg.query(`SELECT tgname, tgenabled FROM pg_trigger WHERE tgrelid='auth.users'::regclass AND NOT tgisinternal`)
  console.log('auth.users triggers:', JSON.stringify(tr.rows))

  // 2) Check function body
  const fn = await pg.query(`SELECT pg_get_functiondef(oid) AS def FROM pg_proc WHERE proname='handle_new_user'`)
  if (fn.rows.length > 0) console.log('handle_new_user body:')
  console.log(fn.rows[0]?.def ?? '(none)')

  // 3) Check what the trigger actually fires for. Try simulating GoTrue's INSERT.
  // GoTrue uses an internal role. The auth.users INSERT path on real signup
  // populates these columns (the "minimum schema" extracted from seed.sql).
  const TEST_ID = 'abcdef00-1111-2222-3333-' + Date.now().toString(16).padStart(12, '0')
  const email = 'sim-' + Date.now() + '@localit-test.dev'
  console.log('Simulating GoTrue-style insert with id=' + TEST_ID)
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
      '{"full_name":"Sim Tester","role":"buddy"}'::jsonb,
      now(), now(), '', '', '', '', '', '', '', '', false, false, 0
    )`, [TEST_ID, email])
    await new Promise(r => setTimeout(r, 600))
    const prof = await pg.query(`SELECT id, role, full_name FROM public.profiles WHERE id = $1`, [TEST_ID])
    console.log('profile after trigger:', JSON.stringify(prof.rows))

    // Also create auth.identities row (what GoTrue does on real signup)
    const identityId = 'abcdef00-9999-8888-7777-' + Date.now().toString(16).padStart(12, '0')
    try {
      await pg.query(`INSERT INTO auth.identities (
        id, user_id, identity_data, provider, provider_id,
        last_sign_in_at, created_at, updated_at
      ) VALUES ($1, $2,
        jsonb_build_object('sub', $2::text, 'email', $3, 'email_verified', true, 'phone_verified', false, 'provider_id', $3, 'email_verified_at', now()),
        'email', $3, now(), now(), now()
      )`, [identityId, TEST_ID, email])
      console.log('identity row created OK')
      await pg.query(`DELETE FROM auth.identities WHERE user_id = $1`, [TEST_ID])
    } catch (ie) {
      console.log('identity insert FAILED:', ie.message)
    }

    // Cleanup
    await pg.query(`DELETE FROM public.profiles WHERE id = $1`, [TEST_ID])
    await pg.query(`DELETE FROM auth.users WHERE id = $1`, [TEST_ID])
    console.log('cleaned')
  } catch (e) {
    console.error('user insert FAILED:', e.message)
  }

  await pg.end()
})()
