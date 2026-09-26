import { Client } from 'pg'
const HOST = 'db.pqvnjgyqbxlylawwogjv.supabase.co'
const PORT = 5432
const DB_USER = 'postgres'
const DB_NAME = 'postgres'
const DB_PW = process.env.DB_PW || 'that1arlecchino'
;(async () => {
  const pg = new Client({ host: HOST, port: PORT, user: DB_USER, password: DB_PW, database: DB_NAME, ssl: { rejectUnauthorized: false } })
  await pg.connect()
  await pg.query(`DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users`)
  await pg.query(`CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user()`)
  console.log('Trigger re-created.')

  const TEST_ID = crypto.randomUUID()
  const email = 'retrigger-' + Date.now() + '@x.com'
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
    '{"full_name":"Re-Trigger Test","role":"tourist"}'::jsonb,
    now(), now(), '', '', '', '', '', '', '', '', false, false, 0
  )`, [TEST_ID, email])
  await new Promise(r => setTimeout(r, 800))
  const prof = await pg.query(`SELECT id, role, full_name FROM public.profiles WHERE id = $1`, [TEST_ID])
  console.log('profile after trigger:', JSON.stringify(prof.rows))
  await pg.query(`DELETE FROM public.profiles WHERE id = $1`, [TEST_ID])
  await pg.query(`DELETE FROM auth.users WHERE id = $1`, [TEST_ID])
  console.log('cleaned.')
  await pg.end()
})()
