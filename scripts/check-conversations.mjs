import pg from 'pg';
const { Client } = pg;
const c = new Client({
  connectionString: `postgresql://postgres:${process.env.SUPABASE_DB_PASSWORD}@db.pqvnjgyqbxlylawwogjv.supabase.co:5432/postgres`,
  ssl: { rejectUnauthorized: false },
});
await c.connect();

// Get all conversations for john.doe
const r = await c.query(`
  SELECT c.id, c.tourist_id, c.buddy_id, c.last_message_preview, c.last_message_at
  FROM public.conversations c
  LEFT JOIN public.tourists t ON t.id = c.tourist_id
  LEFT JOIN public.buddies b ON b.id = c.buddy_id
  ORDER BY c.updated_at DESC
`);
console.log('All conversations:');
for (const row of r.rows) {
  console.log(`  ${row.id.slice(0,8)} | tourist=${row.tourist_user?.slice(0,8)} buddy=${row.buddy_user?.slice(0,8)} | last_msg="${row.last_message_preview || ''}" | ${row.last_message_at}`);
}
await c.end();
