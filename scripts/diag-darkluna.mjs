import { Client } from 'pg';
const c = new Client({
  connectionString: 'postgresql://postgres:that1arlecchino@db.pqvnjgyqbxlylawwogjv.supabase.co:5432/postgres',
  ssl: { rejectUnauthorized: false },
});
await c.connect();

console.log('=== ALL auth.users ===');
const r = await c.query("SELECT id, email, created_at, raw_user_meta_data->>'full_name' as full_name, raw_user_meta_data->>'role' as role FROM auth.users ORDER BY created_at DESC");
console.log('count:', r.rows.length);
console.log(JSON.stringify(r.rows, null, 2));

console.log('\n=== ALL profiles ===');
const p = await c.query("SELECT id, email, role, full_name, created_at FROM public.profiles ORDER BY created_at DESC");
console.log('count:', p.rows.length);
console.log(JSON.stringify(p.rows, null, 2));

console.log('\n=== Public schema tables ===');
const t = await c.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY 1");
console.log(JSON.stringify(t.rows, null, 2));

console.log('\n=== tourists + buddies row counts ===');
const t1 = await c.query("SELECT count(*) FROM public.tourists");
const b1 = await c.query("SELECT count(*) FROM public.buddies");
console.log('tourists:', t1.rows[0].count, 'buddies:', b1.rows[0].count);

console.log('\n=== tourists columns ===');
const tc = await c.query("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='tourists' ORDER BY ordinal_position");
console.log(JSON.stringify(tc.rows, null, 2));

console.log('\n=== buddies columns ===');
const bc = await c.query("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='buddies' ORDER BY ordinal_position");
console.log(JSON.stringify(bc.rows, null, 2));

await c.end();
