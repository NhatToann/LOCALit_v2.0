import { Client } from 'pg'
const c = new Client({
  connectionString: 'postgresql://postgres:that1arlecchino@db.pqvnjgyqbxlylawwogjv.supabase.co:5432/postgres',
  ssl: { rejectUnauthorized: false },
})
async function main() {
  await c.connect()
  const r = await c.query('SELECT * FROM auth.instances')
  console.log('instances:', r.rows)
  const r2 = await c.query("SELECT id, instance_id, raw_app_meta_data FROM auth.users WHERE email = 'john.doe.tourist@gmail.com'")
  console.log('user:', r2.rows)
  // Try with hardcoded UUID
  const r3 = await c.query("INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token) VALUES ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated', 'test@test.com', crypt('test1234', gen_salt('bf')), now(), '{\"provider\":\"email\",\"providers\":[\"email\"]}', '{}', now(), now(), '', '', '', '') RETURNING id, instance_id")
  console.log('test insert:', r3.rows)
  await c.query("DELETE FROM auth.users WHERE email = 'test@test.com'")
  await c.end()
}
main().catch(console.error)
