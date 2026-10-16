import { Client } from 'pg';
const c = new Client({
  connectionString: 'postgresql://postgres:that1arlecchino@db.pqvnjgyqbxlylawwogjv.supabase.co:5432/postgres',
  ssl: { rejectUnauthorized: false },
});
await c.connect();

const u = await c.query(`SELECT id, email, raw_user_meta_data->>'full_name' AS full_name, raw_user_meta_data->>'role' AS role FROM auth.users WHERE email = 'darkluna.fix.1792174830308@gmail.com'`);
console.log('auth.users:', JSON.stringify(u.rows, null, 2));

const p = await c.query(`SELECT id, email, role, full_name FROM public.profiles WHERE email = 'darkluna.fix.1792174830308@gmail.com'`);
console.log('\nprofiles:', JSON.stringify(p.rows, null, 2));

const t = await c.query(`SELECT id, nationality, travel_style, interests, languages, destination FROM public.tourists WHERE id = (SELECT id FROM public.profiles WHERE email = 'darkluna.fix.1792174830308@gmail.com' LIMIT 1)`);
console.log('\ntourists:', JSON.stringify(t.rows, null, 2));

const ev = await c.query(`SELECT id, email, verified_at, consumed_at FROM public.email_verifications WHERE email = 'darkluna.fix.1792174830308@gmail.com' ORDER BY created_at DESC LIMIT 1`);
console.log('\nemail_verifications:', JSON.stringify(ev.rows, null, 2));

await c.end();