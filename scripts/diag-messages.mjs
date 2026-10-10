import pg from 'pg'
const {Client} = pg;
const c = new Client({
  connectionString:'postgresql://postgres:that1arlecchino@db.pqvnjgyqbxlylawwogjv.supabase.co:5432/postgres',
  ssl:{rejectUnauthorized:false}
});
c.connect().then(async () => {
  const r = await c.query(`
    SELECT m.id, m.content, m.sender_id, m.created_at, m.conversation_id,
           p.full_name as sender_name
    FROM public.messages m
    JOIN public.profiles p ON p.id = m.sender_id
    WHERE m.content LIKE '%Xin chào from focus rewrite%' OR m.content = 'Hi'
    ORDER BY m.created_at DESC
    LIMIT 30
  `);
  console.log('Messages with content matching:');
  r.rows.forEach(row => {
    console.log(`  [${row.created_at.toISOString()}] ${row.sender_name}: ${row.content} (conv: ${row.conversation_id.slice(0,8)})`);
  });
  await c.end();
}).catch(e => { console.error(e.message); process.exit(1); });
