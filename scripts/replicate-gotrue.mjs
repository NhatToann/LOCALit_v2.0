import { Client } from 'pg'
const c = new Client({
  connectionString: 'postgresql://postgres:that1arlecchino@db.pqvnjgyqbxlylawwogjv.supabase.co:5432/postgres',
  ssl: { rejectUnauthorized: false },
})
await c.connect()
// Try the EXACT query GoTrue does on sign-in:
// 1. Look up user
const { rows: u } = await c.query(
  `SELECT id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
     raw_app_meta_data, raw_user_meta_data, is_super_admin, created_at, updated_at,
     phone, phone_confirmed_at, phone_change, phone_change_token, phone_change_sent_at,
     confirmed_at, email_change, email_change_token_current, email_change_confirm_status,
     banned_until, reauthentication_token, reauthentication_sent_at, is_sso_user,
     deleted_at, is_anonymous
   FROM auth.users
   WHERE email = $1`,
  ['e2e-final@autotest.dev'],
)
console.log('user lookup rows:', u.length)
console.log(JSON.stringify(u[0], null, 2))

// 2. Look up identities
const { rows: ids } = await c.query(
  `SELECT id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at, email
   FROM auth.identities
   WHERE provider_id = $1 AND provider = 'email'`,
  ['e2e-final@autotest.dev'],
)
console.log('identities:', ids.length)
console.log(JSON.stringify(ids[0], null, 2))

// 3. Verify password
const { rows: cryptCheck } = await c.query(
  `SELECT (encrypted_password = crypt($2, encrypted_password)) AS pw_match
   FROM auth.users WHERE email = $1`,
  ['e2e-final@autotest.dev', 'Test1234!@#$'],
)
console.log('password match:', cryptCheck[0])
await c.end()