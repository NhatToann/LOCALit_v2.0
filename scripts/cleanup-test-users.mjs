import { Client } from 'pg';
const c = new Client({ connectionString: 'postgresql://postgres:that1arlecchino@db.pqvnjgyqbxlylawwogjv.supabase.co:5432/postgres', ssl: { rejectUnauthorized: false } });
await c.connect();
// Cleanup the test users created in this session
const r = await c.query(`DELETE FROM auth.users WHERE email LIKE 'e2e.reg.%' OR email LIKE 'darkluna.fix.%' OR email LIKE 'darkluna.probe.%' OR email LIKE 'darkluna.otpcheck.%' OR email LIKE 'darkluna.regtest.%' RETURNING email`);
console.log('cleaned up:', JSON.stringify(r.rows));
await c.end();