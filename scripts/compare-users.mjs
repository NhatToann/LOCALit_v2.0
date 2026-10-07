import { Client } from 'pg'
const c = new Client({
  connectionString: 'postgresql://postgres:that1arlecchino@db.pqvnjgyqbxlylawwogjv.supabase.co:5432/postgres',
  ssl: { rejectUnauthorized: false },
})
await c.connect()
const { rows: ours } = await c.query(`
  SELECT id::text, instance_id::text, aud, role, encrypted_password,
    email_confirmed_at::text, raw_app_meta_data, raw_user_meta_data,
    is_sso_user, is_anonymous, confirmed_at::text, banned_until::text,
    email_change, recovery_token, deleted_at::text
  FROM auth.users WHERE email = 'e2e-final@autotest.dev'
`)
console.log('e2e-final user full row:', JSON.stringify(ours, null, 2))
const { rows: theirs } = await c.query(`
  SELECT id::text, instance_id::text, aud, role, encrypted_password,
    email_confirmed_at::text, raw_app_meta_data, raw_user_meta_data,
    is_sso_user, is_anonymous, confirmed_at::text, banned_until::text,
    email_change, recovery_token, deleted_at::text
  FROM auth.users WHERE email = 'lan.pham@localit.dev'
`)
console.log('lan.pham full row:', JSON.stringify(theirs, null, 2))
await c.end()