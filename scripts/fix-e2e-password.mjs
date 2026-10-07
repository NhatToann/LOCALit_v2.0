import { Client } from 'pg'
const c = new Client({
  connectionString: 'postgresql://postgres:that1arlecchino@db.pqvnjgyqbxlylawwogjv.supabase.co:5432/postgres',
  ssl: { rejectUnauthorized: false },
})
await c.connect()
const now = new Date().toISOString()
await c.query(
  `UPDATE auth.users
   SET email_change = COALESCE(email_change, ''),
       email_change_token_new = COALESCE(email_change_token_new, ''),
       email_change_token_current = COALESCE(email_change_token_current, ''),
       email_change_confirm_status = COALESCE(email_change_confirm_status, 0),
       recovery_token = COALESCE(recovery_token, ''),
       phone_change = COALESCE(phone_change, ''),
       phone_change_token = COALESCE(phone_change_token, ''),
       reauthentication_token = COALESCE(reauthentication_token, '')
   WHERE email = 'e2e-final@autotest.dev'`,
)
await c.query(
  `UPDATE auth.identities
   SET last_sign_in_at = COALESCE(last_sign_in_at, $2)
   WHERE user_id = (SELECT id FROM auth.users WHERE email = $1)`,
  ['e2e-final@autotest.dev', now],
)
console.log('backfilled e2e-final user + identities')
await c.end()