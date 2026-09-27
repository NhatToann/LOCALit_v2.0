import pg from 'pg';
const { Client } = pg;
const c = new Client({
  connectionString: `postgresql://postgres:${process.env.SUPABASE_DB_PASSWORD}@db.pqvnjgyqbxlylawwogjv.supabase.co:5432/postgres`,
  ssl: { rejectUnauthorized: false },
});
await c.connect();
const r = await c.query(`
  SELECT conrelid::regclass AS table_from, confrelid::regclass AS table_to,
         conname, pg_get_constraintdef(oid) AS definition
  FROM pg_constraint
  WHERE contype = 'f'
    AND (conrelid::regclass::text = 'messages' OR confrelid::regclass::text = 'messages'
         OR conrelid::regclass::text = 'conversations' OR confrelid::regclass::text = 'conversations')
`);
for (const row of r.rows) {
  console.log(`${row.table_from} → ${row.table_to}: ${row.conname}: ${row.definition}`);
}
await c.end();
