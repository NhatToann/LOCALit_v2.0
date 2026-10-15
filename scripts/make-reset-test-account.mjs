#!/usr/bin/env node
/**
 * Create a disposable account for the password-reset end-user test.
 *
 * The reset flow must be proven against a REAL account: the whole point of
 * the change is that it works for accounts Supabase had already throttled
 * (e.g. darklunatv@gmail.com, whose /auth/v1/recover call returns 429).
 *
 * Prints the email + password so the e2e script can sign in afterwards and
 * confirm the new password really took effect.
 */
import { Client } from 'pg'

const EMAIL = process.argv[2] || `resetprobe-${Date.now()}@example.com`
const PASSWORD = 'OldPass12345!'
const NEW_PASSWORD = 'BrandNewPass987!'

const c = new Client({
  host: 'db.pqvnjgyqbxlylawwogjv.supabase.co',
  port: 5432,
  user: 'postgres',
  password: 'that1arlecchino',
  database: 'postgres',
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 15000,
})
await c.connect()

const existing = await c.query('select id from auth.users where email = $1', [EMAIL])
if (existing.rows.length) {
  console.log(JSON.stringify({ email: EMAIL, password: PASSWORD, reused: true }))
  await c.end()
  process.exit(0)
}

const userId = crypto.randomUUID()
await c.query(
  `INSERT INTO auth.users (id, email, instance_id, aud, role)
   VALUES ($1,$2,'00000000-0000-0000-0000-000000000000'::uuid,'authenticated','authenticated')`,
  [userId, EMAIL],
)
await c.query(
  `UPDATE auth.users
   SET aud=COALESCE(aud,'authenticated'), role=COALESCE(role,'authenticated'),
       instance_id=COALESCE(instance_id,'00000000-0000-0000-0000-000000000000'::uuid),
       encrypted_password=crypt($2, gen_salt('bf')),
       email_confirmed_at=COALESCE(email_confirmed_at, now()),
       confirmation_token=COALESCE(confirmation_token,''),
       email_change=COALESCE(email_change,''),
       email_change_token_new=COALESCE(email_change_token_new,''),
       email_change_token_current=COALESCE(email_change_token_current,''),
       recovery_token=COALESCE(recovery_token,''),
       reauthentication_token=COALESCE(reauthentication_token,''),
       phone_change=COALESCE(phone_change,''),
       phone_change_token=COALESCE(phone_change_token,''),
       raw_app_meta_data=COALESCE(raw_app_meta_data,'{"provider":"email","providers":["email"]}'::jsonb),
       raw_user_meta_data=COALESCE(raw_user_meta_data,'{}'::jsonb),
       created_at=COALESCE(created_at, now()),
       is_anonymous=false, is_sso_user=false,
       email_change_confirm_status=COALESCE(email_change_confirm_status,0),
       updated_at=now()
   WHERE id=$1::uuid`,
  [userId, PASSWORD],
)
await c.query(
  `INSERT INTO auth.identities (id,user_id,identity_data,provider,provider_id,last_sign_in_at,created_at,updated_at)
   VALUES (gen_random_uuid(),$1::uuid,
           jsonb_build_object('sub',$1::text,'email',$2::text,'email_verified',true,'phone_verified',false),
           'email',$2::text,now(),now(),now())
   ON CONFLICT (provider,provider_id) DO NOTHING`,
  [userId, EMAIL],
)

console.log(
  JSON.stringify({ email: EMAIL, password: PASSWORD, newPassword: NEW_PASSWORD }),
)
await c.end()