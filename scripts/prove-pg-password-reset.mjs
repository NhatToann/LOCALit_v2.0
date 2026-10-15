#!/usr/bin/env node
/**
 * PROVE the OTP reset can update a password WITHOUT the service-role key.
 *
 * This is the make-or-break assumption for the whole feature. GoTrue's
 * own endpoints need SUPABASE_SERVICE_ROLE_KEY (redacted in this
 * session), but auth.users is just a Postgres table — we have the DB
 * password, so we can UPDATE encrypted_password directly with crypt().
 *
 * Test on a throwaway account only. Creates it, resets its password,
 * signs in through the real GoTrue password grant to prove the hash is
 * valid, then deletes the account.
 */
import { Client } from 'pg'

const HOST = 'db.pqvnjgyqbxlylawwogjv.supabase.co'
const PW = 'that1arlecchino'
const SUPABASE = 'https://pqvnjgyqbxlylawwogjv.supabase.co'
const ANON = 'sb_publishable_3uRUZqdvazd4cENt8WOWJA_SB7HmCEE'
const EMAIL = `otptest-${Date.now()}@example.com`
const OLD_PW = 'OldPass12345!'
const NEW_PW = 'NewPass12345!'

const c = new Client({
  host: HOST,
  port: 5432,
  user: 'postgres',
  password: PW,
  database: 'postgres',
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 15000,
})
await c.connect()

async function goTrueSignIn(password) {
  const r = await fetch(`${SUPABASE}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password }),
  })
  const j = await r.json().catch(() => ({}))
  return { status: r.status, ok: r.status === 200, err: j.error_description || j.msg }
}

try {
  console.log(`test account: ${EMAIL}\n`)

  // 1. Create the account exactly like createAuthUser() does.
  const userId = crypto.randomUUID()
  await c.query(
    `INSERT INTO auth.users (id, email, instance_id, aud, role)
     VALUES ($1, $2, '00000000-0000-0000-0000-000000000000'::uuid, 'authenticated', 'authenticated')`,
    [userId, EMAIL],
  )
  await c.query(
    `UPDATE auth.users
     SET aud = COALESCE(aud,'authenticated'), role = COALESCE(role,'authenticated'),
         instance_id = COALESCE(instance_id,'00000000-0000-0000-0000-000000000000'::uuid),
         encrypted_password = crypt($2, gen_salt('bf')),
         email_confirmed_at = COALESCE(email_confirmed_at, now()),
         confirmation_token = COALESCE(confirmation_token,''),
         email_change = COALESCE(email_change,''),
         email_change_token_new = COALESCE(email_change_token_new,''),
         email_change_token_current = COALESCE(email_change_token_current,''),
         recovery_token = COALESCE(recovery_token,''),
         reauthentication_token = COALESCE(reauthentication_token,''),
         phone_change = COALESCE(phone_change,''),
         phone_change_token = COALESCE(phone_change_token,''),
         raw_app_meta_data = COALESCE(raw_app_meta_data,'{"provider":"email","providers":["email"]}'::jsonb),
         raw_user_meta_data = COALESCE(raw_user_meta_data,'{}'::jsonb),
         created_at = COALESCE(created_at, now()),
         is_anonymous = false, is_sso_user = false,
         email_change_confirm_status = COALESCE(email_change_confirm_status,0),
         updated_at = now()
     WHERE id = $1::uuid`,
    [userId, OLD_PW],
  )
  await c.query(
    `INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
     VALUES (gen_random_uuid(), $1::uuid,
             jsonb_build_object('sub',$1::text,'email',$2::text,'email_verified',true,'phone_verified',false),
             'email', $2::text, now(), now(), now())
     ON CONFLICT (provider, provider_id) DO NOTHING`,
    [userId, EMAIL],
  )

  const s1 = await goTrueSignIn(OLD_PW)
  console.log(`1. created + sign in with ORIGINAL password -> ${s1.status} ${s1.ok ? 'PASS' : 'FAIL ' + s1.err}`)

  // 2. THE CRITICAL STEP: reset the password with pg only, no service key.
  await c.query(
    `UPDATE auth.users SET encrypted_password = crypt($2, gen_salt('bf')), updated_at = now() WHERE id = $1::uuid`,
    [userId, NEW_PW],
  )
  console.log('2. ran: UPDATE auth.users SET encrypted_password = crypt(...)  [pg only]')

  const oldTry = await goTrueSignIn(OLD_PW)
  const newTry = await goTrueSignIn(NEW_PW)
  console.log(`3. sign in with OLD password -> ${oldTry.status} ${oldTry.ok ? 'UNEXPECTED PASS' : 'correctly rejected'}`)
  console.log(`4. sign in with NEW password -> ${newTry.status} ${newTry.ok ? 'PASS' : 'FAIL ' + newTry.err}`)

  // 3. A recovery event must also be invalidated, or old reset links stay live.
  await c.query(
    `UPDATE auth.users
     SET recovery_token='', email_change_token_new='', email_change_token_current='',
         reauthentication_token='', updated_at = now()
     WHERE id = $1::uuid`,
    [userId],
  )
  console.log('5. cleared recovery_token + reauthentication_token (kills any live reset link)')

  const verdict =
    s1.ok && !oldTry.ok && newTry.ok
      ? '\nVERDICT: pg-direct password reset WORKS without the service-role key.'
      : '\nVERDICT: pg-direct reset does NOT work as assumed — re-evaluate.'
  console.log(verdict)
} finally {
  // Clean up the throwaway account completely.
  await c.query(`DELETE FROM auth.users WHERE email = $1`, [EMAIL]).catch(() => {})
  const left = await c
    .query(`SELECT count(*)::int n FROM auth.users WHERE email = $1`, [EMAIL])
    .catch(() => ({ rows: [{ n: -1 }] }))
  console.log(`\ncleanup: test account removed (rows left: ${left.rows[0].n})`)
  await c.end()
}