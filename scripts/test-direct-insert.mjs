import { Client } from 'pg'
import { randomUUID } from 'crypto'

const c = new Client({
  connectionString: 'postgresql://postgres:that1arlecchino@db.pqvnjgyqbxlylawwogjv.supabase.co:5432/postgres',
  ssl: { rejectUnauthorized: false },
})
await c.connect()

const userId = randomUUID()
const now = new Date().toISOString()
try {
  await c.query(
    `INSERT INTO auth.users (
       instance_id, id, aud, role, email,
       encrypted_password, email_confirmed_at,
       raw_app_meta_data, raw_user_meta_data,
       created_at, updated_at,
       is_sso_user, is_anonymous,
       email_change_token_current, email_change_confirm_status,
       phone_change, phone_change_token, reauthentication_token
     ) VALUES (
       '00000000-0000-0000-0000-000000000000', $1, 'authenticated', 'authenticated', $2,
       crypt($3, gen_salt('bf')), $4,
       $5, $6,
       $4, $4,
       false, false,
       '', 0,
       '', '', ''
     )`,
    [
      userId,
      'direct-test@autotest.dev',
      'Test1234!@#$',
      now,
      JSON.stringify({ provider: 'email', providers: ['email'] }),
      JSON.stringify({ full_name: 'Direct Test', role: 'tourist' }),
    ],
  )
  console.log('INSERT OK, userId=', userId)

  // Verify the hash works with crypt()
  const { rows } = await c.query(
    `SELECT crypt($2, encrypted_password) = encrypted_password AS match
     FROM auth.users WHERE id = $1`,
    [userId, 'Test1234!@#$'],
  )
  console.log('crypt() verification match:', rows[0])

  await c.query(`DELETE FROM auth.users WHERE id = $1`, [userId])
  console.log('cleanup OK')
} catch (e) {
  console.error('FAILED:', e.message)
}
await c.end()