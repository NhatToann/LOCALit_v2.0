import { Client } from 'pg';
const client = new Client({
  connectionString: `postgresql://postgres:that1arlecchino@db.pqvnjgyqbxlylawwogjv.supabase.co:5432/postgres`,
  ssl: { rejectUnauthorized: false },
});
await client.connect();
const { rows } = await client.query(
  "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'messages' AND column_name IN ('kind', 'meta') ORDER BY column_name"
);
console.log(JSON.stringify(rows, null, 2));
await client.end();