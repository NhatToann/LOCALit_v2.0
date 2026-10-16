import { Client } from 'pg';
const c = new Client({
  connectionString: 'postgresql://postgres:that1arlecchino@db.pqvnjgyqbxlylawwogjv.supabase.co:5432/postgres',
  ssl: { rejectUnauthorized: false },
});
await c.connect();

// The auth.users row was created with raw_user_meta_data.full_name='Phan Nhật Toàn',
// but the on_auth_user_created trigger fired before we set raw_user_meta_data,
// so it inserted profiles.full_name='darklunatv'. Sync it now.
const r = await c.query(`
  UPDATE public.profiles
  SET full_name = COALESCE(
    NULLIF((SELECT raw_user_meta_data->>'full_name' FROM auth.users WHERE id = profiles.id), ''),
    full_name
  )
  WHERE email = 'darklunatv@gmail.com'
  RETURNING id, email, full_name
`);
console.log('updated:', JSON.stringify(r.rows, null, 2));
await c.end();