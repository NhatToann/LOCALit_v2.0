import pg from 'pg';
const { Client } = pg;
const c = new Client({
  connectionString: `postgresql://postgres:${process.env.SUPABASE_DB_PASSWORD}@db.pqvnjgyqbxlylawwogjv.supabase.co:5432/postgres`,
  ssl: { rejectUnauthorized: false },
});
await c.connect();
const r = await c.query(`SELECT schemaname, tablename, policyname, cmd, qual FROM pg_policies WHERE tablename IN ('tourists','buddies','conversations','profiles') ORDER BY tablename, policyname`);
for (const row of r.rows) console.log(`${row.tablename}.${row.policyname} (${row.cmd}): ${row.qual}`);
await c.end();
