import pg from 'pg'
const {Client} = pg
const c = new Client({
  connectionString:'postgresql://postgres:that1arlecchino@db.pqvnjgyqbxlylawwogjv.supabase.co:5432/postgres',
  ssl:{rejectUnauthorized:false}
})
c.connect().then(async () => {
  // Get the conv 8c48a631
  const conv = await c.query(`
    SELECT c.id, c.tourist_id, c.buddy_id,
           tp.full_name as tourist_name, bp.full_name as buddy_name
    FROM public.conversations c
    JOIN public.profiles tp ON tp.id = c.tourist_id
    JOIN public.profiles bp ON bp.id = c.buddy_id
    WHERE c.id::text LIKE '8c48a631%'
  `)
  console.log('Conv 8c48a631:', conv.rows[0])

  // Get messages in this conv
  const msgs = await c.query(`
    SELECT m.id, m.content, m.created_at, p.full_name as sender
    FROM public.messages m
    JOIN public.profiles p ON p.id = m.sender_id
    WHERE m.conversation_id = $1
    ORDER BY m.created_at DESC
    LIMIT 20
  `, [conv.rows[0]?.id])
  console.log(`\nMessages in ${conv.rows[0]?.id} (${conv.rows[0]?.tourist_name} ↔ ${conv.rows[0]?.buddy_name}):`)
  for (const m of msgs.rows) {
    console.log(`  [${m.created_at.toISOString()}] ${m.sender}: ${m.content.slice(0,60)}`)
  }

  // Check auth.users mapping for these
  const auth = await c.query(`
    SELECT id, email FROM auth.users
    WHERE id IN ($1, $2)
  `, [conv.rows[0]?.tourist_id, conv.rows[0]?.buddy_id])
  console.log('\nAuth users:')
  for (const u of auth.rows) {
    console.log(`  ${u.id} | ${u.email}`)
  }
  await c.end()
}).catch(e => { console.error(e.message); process.exit(1) })
