import pg from 'pg'
const {Client} = pg
const c = new Client({
  connectionString:'postgresql://postgres:that1arlecchino@db.pqvnjgyqbxlylawwogjv.supabase.co:5432/postgres',
  ssl:{rejectUnauthorized:false}
})
c.connect().then(async () => {
  const huy = await c.query(`SELECT id, full_name FROM public.profiles WHERE full_name ILIKE '%huy%'`)
  console.log('Huy:', huy.rows)
  const convs = await c.query(`
    SELECT c.id, tp.full_name as tourist_name, bp.full_name as buddy_name
    FROM public.conversations c
    JOIN public.profiles tp ON tp.id = c.tourist_id
    JOIN public.profiles bp ON bp.id = c.buddy_id
    WHERE c.tourist_id = $1 OR c.buddy_id = $1
  `, [huy.rows[0]?.id])
  console.log('Huy convs:')
  for (const row of convs.rows) {
    console.log(`  ${row.id.slice(0,8)} | ${row.tourist_name} ↔ ${row.buddy_name}`)
  }
  for (const conv of convs.rows) {
    const msgs = await c.query(`
      SELECT m.content, m.created_at, p.full_name as sender
      FROM public.messages m
      JOIN public.profiles p ON p.id = m.sender_id
      WHERE conversation_id = $1
      ORDER BY created_at ASC
    `, [conv.id])
    console.log(`Messages in ${conv.id.slice(0,8)} (${conv.tourist_name} ↔ ${conv.buddy_name}):`)
    for (const m of msgs.rows) {
      console.log(`  [${m.created_at.toISOString()}] ${m.sender}: ${m.content.slice(0,50)}`)
    }
  }
  await c.end()
}).catch(e => { console.error(e.message); process.exit(1) })
