import pg from 'pg'
const {Client} = pg
const c = new Client({
  connectionString:'postgresql://postgres:that1arlecchino@db.pqvnjgyqbxlylawwogjv.supabase.co:5432/postgres',
  ssl:{rejectUnauthorized:false}
})
c.connect().then(async () => {
  const r = await c.query(`
    SELECT m.id, m.content, m.created_at, m.conversation_id,
           p.full_name as sender_name,
           cp.full_name as partner_name
    FROM public.messages m
    JOIN public.profiles p ON p.id = m.sender_id
    JOIN public.conversations c ON c.id = m.conversation_id
    JOIN public.profiles cp ON (cp.id = CASE WHEN c.tourist_id = m.sender_id THEN c.buddy_id ELSE c.tourist_id END)
    WHERE m.content = 'Hi' OR m.content LIKE '%Xin chào from focus rewrite%'
    ORDER BY m.created_at DESC
    LIMIT 30
  `)
  console.log('All recent messages:')
  for (const row of r.rows) {
    console.log(`  [${row.created_at.toISOString()}] ${row.sender_name} → ${row.partner_name} (conv: ${row.conversation_id.slice(0,8)}): ${row.content.slice(0,40)}`)
  }
  await c.end()
}).catch(e => { console.error(e.message); process.exit(1) })
