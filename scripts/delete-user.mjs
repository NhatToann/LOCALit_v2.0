// scripts/delete-user.mjs — drops auth.users + auth.identities + public.profiles
// + public.tourists + public.buddies + public.email_verifications for a given email.
//
// Usage: node scripts/delete-user.mjs <email>
import { Client } from 'pg';

const email = process.argv[2];
if (!email) {
  console.error('Usage: node scripts/delete-user.mjs <email>');
  process.exit(1);
}

const c = new Client({
  connectionString: 'postgresql://postgres:that1arlecchino@db.pqvnjgyqbxlylawwogjv.supabase.co:5432/postgres',
  ssl: { rejectUnauthorized: false },
});
await c.connect();

const u = await c.query('SELECT id FROM auth.users WHERE email = $1', [email]);
if (u.rows.length === 0) {
  console.log('no auth.users row for', email);
  await c.end();
  process.exit(0);
}
const userId = u.rows[0].id;
console.log('user id:', userId);

const ev = await c.query('DELETE FROM public.email_verifications WHERE email = $1', [email]);
console.log('deleted email_verifications rows:', ev.rowCount);

const r1 = await c.query('DELETE FROM public.tourists WHERE id = $1', [userId]);
console.log('deleted tourists:', r1.rowCount);
const r2 = await c.query('DELETE FROM public.buddies WHERE id = $1', [userId]);
console.log('deleted buddies:', r2.rowCount);
const r3 = await c.query('DELETE FROM public.profiles WHERE id = $1', [userId]);
console.log('deleted profiles:', r3.rowCount);

const r4 = await c.query('DELETE FROM auth.identities WHERE user_id = $1', [userId]);
console.log('deleted auth.identities:', r4.rowCount);
const r5 = await c.query('DELETE FROM auth.users WHERE id = $1', [userId]);
console.log('deleted auth.users:', r5.rowCount);

const v = await c.query('SELECT count(*)::int AS n FROM auth.users WHERE email = $1', [email]);
console.log('remaining auth.users for', email, ':', v.rows[0].n);
await c.end();