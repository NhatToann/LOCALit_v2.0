import pg from 'pg';
const { Client } = pg;
const c = new Client({
  connectionString: `postgresql://postgres:${process.env.SUPABASE_DB_PASSWORD}@db.pqvnjgyqbxlylawwogjv.supabase.co:5432/postgres`,
  ssl: { rejectUnauthorized: false },
});
await c.connect();

const r = await c.query(`
  SELECT id, conversation_id, sender_id, content, created_at, deleted_at
  FROM public.messages
  ORDER BY created_at DESC
  LIMIT 10
`);
console.log('Recent messages:');
for (const row of r.rows) console.log(`  ${row.id.slice(0,8)} conv=${row.conversation_id?.slice(0,8)} sender=${row.sender_id?.slice(0,8)} | ${row.content.slice(0,50)} | deleted=${row.deleted_at}`);

const c2 = await c.query(`
  SELECT id, tourist_id, buddy_id, status FROM public.connections ORDER BY created_at DESC LIMIT 10
`);
console.log('\nConnections:');
for (const row of c2.rows) console.log(`  ${row.id.slice(0,8)} tourist=${row.tourist_id?.slice(0,8)} buddy=${row.buddy_id?.slice(0,8)} | ${row.status}`);

await c.end();
