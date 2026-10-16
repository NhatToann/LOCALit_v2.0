import { Client } from 'pg';
const c = new Client({
  connectionString: 'postgresql://postgres:that1arlecchino@db.pqvnjgyqbxlylawwogjv.supabase.co:5432/postgres',
  ssl: { rejectUnauthorized: false },
});
await c.connect();

const r = await c.query(`
  SELECT id, email, verified_at, consumed_at, expires_at, attempts, pending_payload
  FROM public.email_verifications
  WHERE consumed_at IS NULL AND verified_at IS NOT NULL
  ORDER BY created_at DESC LIMIT 3
`);
console.log('verified+unconsumed rows:');
console.log(JSON.stringify(r.rows, null, 2));

await c.end();