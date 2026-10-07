import { Client } from 'pg';
const c = new Client({
  connectionString: 'postgresql://postgres:that1arlecchino@db.pqvnjgyqbxlylawwogjv.supabase.co:5432/postgres',
  ssl: { rejectUnauthorized: false },
});
await c.connect();
const { rows } = await c.query(`SELECT id, email, expires_at, attempts, verified_at, consumed_at FROM public.email_verifications WHERE email = $1`, ['real.fix.test.1791393041760@gmail.com']);
console.log('Signup row:', JSON.stringify(rows[0], null, 2));
await c.end();