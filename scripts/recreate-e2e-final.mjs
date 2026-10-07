import { Client } from 'pg'
const c = new Client({
  connectionString: 'postgresql://postgres:that1arlecchino@db.pqvnjgyqbxlylawwogjv.supabase.co:5432/postgres',
  ssl: { rejectUnauthorized: false },
})
await c.connect()

const DEMO_EMAIL = 'e2e-final@autotest.dev'
const DEMO_PW = 'Test1234!@#$'

const { rows: exists } = await c.query(`SELECT 1 FROM auth.users WHERE email = $1`, [DEMO_EMAIL])
if (exists.length > 0) {
  console.log('already exists, exiting')
  process.exit(0)
}

// Step 1: Insert minimal auth.users row, then fix everything with the same
// UPDATE pattern that fix-seed-users.mjs uses. This is the proven path.
const userId = crypto.randomUUID()
await c.query(
  `INSERT INTO auth.users (id, email, instance_id, aud, role)
   VALUES ($1, $2, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated')`,
  [userId, DEMO_EMAIL],
)
await c.query(
  `UPDATE auth.users
   SET aud = COALESCE(aud, 'authenticated'),
       role = COALESCE(role, 'authenticated'),
       instance_id = COALESCE(instance_id, '00000000-0000-0000-0000-000000000000'::uuid),
       encrypted_password = crypt($2, gen_salt('bf')),
       email_confirmed_at = COALESCE(email_confirmed_at, now()),
       confirmation_token = COALESCE(confirmation_token, ''),
       email_change = COALESCE(email_change, ''),
       email_change_token_new = COALESCE(email_change_token_new, ''),
       email_change_token_current = COALESCE(email_change_token_current, ''),
       recovery_token = COALESCE(recovery_token, ''),
       reauthentication_token = COALESCE(reauthentication_token, ''),
       phone_change = COALESCE(phone_change, ''),
       phone_change_token = COALESCE(phone_change_token, ''),
       raw_app_meta_data = COALESCE(raw_app_meta_data, '{"provider":"email","providers":["email"]}'::jsonb),
       created_at = COALESCE(created_at, now()),
       is_anonymous = false,
       is_sso_user = false,
       email_change_confirm_status = COALESCE(email_change_confirm_status, 0),
       updated_at = now()
   WHERE id = $1::uuid
   RETURNING email, email_confirmed_at IS NOT NULL AS confirmed`,
  [userId, DEMO_PW],
)

// Now insert the identities row exactly like fix-seed-users does.
await c.query(
  `INSERT INTO auth.identities (
     id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
   ) VALUES (
     gen_random_uuid(),
     $1::uuid,
     jsonb_build_object('sub', $1::text, 'email', $2::text, 'email_verified', true, 'phone_verified', false),
     'email',
     $2::text,
     now(),
     now(),
     now()
   )
   ON CONFLICT (provider, provider_id) DO UPDATE
     SET last_sign_in_at = now(), updated_at = now()`,
  [userId, DEMO_EMAIL],
)
console.log('created user', userId, 'with all default columns populated')
await c.end()