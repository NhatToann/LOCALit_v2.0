import { Client } from 'pg';
const c = new Client({
  connectionString: 'postgresql://postgres:that1arlecchino@db.pqvnjgyqbxlylawwogjv.supabase.co:5432/postgres',
  ssl: { rejectUnauthorized: false },
});
await c.connect();

const u = await c.query(`SELECT id, email, raw_user_meta_data, created_at FROM auth.users WHERE email = 'darklunatv@gmail.com'`);
console.log('auth.users details:');
console.log(JSON.stringify(u.rows, null, 2));

const p = await c.query(`SELECT id, email, role, full_name, created_at, updated_at FROM public.profiles WHERE email = 'darklunatv@gmail.com'`);
console.log('\nprofiles details:');
console.log(JSON.stringify(p.rows, null, 2));

await c.end();