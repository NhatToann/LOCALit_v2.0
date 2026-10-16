import { Client } from 'pg';
const c = new Client({
  connectionString: 'postgresql://postgres:that1arlecchino@db.pqvnjgyqbxlylawwogjv.supabase.co:5432/postgres',
  ssl: { rejectUnauthorized: false },
});
await c.connect();

const r = await c.query(`
  SELECT id, email, verified_at, consumed_at, expires_at, attempts
  FROM public.email_verifications
  WHERE email = 'darklunatv@gmail.com'
  ORDER BY created_at DESC LIMIT 3
`);
console.log('rows:');
console.log(JSON.stringify(r.rows, null, 2));

const u = await c.query(`SELECT id, email, raw_user_meta_data->>'full_name' AS full_name FROM auth.users WHERE email = 'darklunatv@gmail.com'`);
console.log('\nauth.users:');
console.log(JSON.stringify(u.rows, null, 2));

const p = await c.query(`SELECT id, email, role, full_name FROM public.profiles WHERE email = 'darklunatv@gmail.com'`);
console.log('\nprofiles:');
console.log(JSON.stringify(p.rows, null, 2));

const t = await c.query(`SELECT id, nationality, interests, languages FROM public.tourists WHERE id = (SELECT id FROM public.profiles WHERE email = 'darklunatv@gmail.com' LIMIT 1)`);
console.log('\ntourists:');
console.log(JSON.stringify(t.rows, null, 2));

await c.end();