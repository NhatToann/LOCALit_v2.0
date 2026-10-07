import { Client } from 'pg';
const c = new Client({
  connectionString: 'postgresql://postgres:that1arlecchino@db.pqvnjgyqbxlylawwogjv.supabase.co:5432/postgres',
  ssl: { rejectUnauthorized: false },
});
await c.connect();
const { rows } = await c.query(`
  SELECT column_name, data_type, is_nullable, column_default
  FROM information_schema.columns
  WHERE table_schema = 'auth' AND table_name = 'users'
  ORDER BY ordinal_position
`);
console.log('auth.users columns:');
for (const r of rows) console.log(`  ${r.column_name}: ${r.data_type} (nullable=${r.is_nullable}, default=${r.column_default})`);

const { rows: constrs } = await c.query(`
  SELECT conname, contype, pg_get_constraintdef(oid) AS def
  FROM pg_constraint
  WHERE conrelid = 'auth.users'::regclass
`);
console.log('\nauth.users constraints:');
for (const r of constrs) console.log(`  ${r.conname} (${r.contype}): ${r.def}`);

await c.end();