import { Client } from 'pg';
const c = new Client({
  connectionString: 'postgresql://postgres:that1arlecchino@db.pqvnjgyqbxlylawwogjv.supabase.co:5432/postgres',
  ssl: { rejectUnauthorized: false },
});
await c.connect();
const { rows } = await c.query(`SELECT id, email, expires_at, attempts, verified_at, consumed_at, created_at FROM public.email_verifications WHERE email LIKE 'e2e.%' ORDER BY created_at DESC LIMIT 5`);
console.log('Recent e2e signup rows:');
for (const r of rows) console.log(`  ${JSON.stringify(r)}`);
await c.end();