import pg from 'pg'
const {Client} = pg
const c = new Client({
  connectionString:'postgresql://postgres:that1arlecchino@db.pqvnjgyqbxlylawwogjv.supabase.co:5432/postgres',
  ssl:{rejectUnauthorized:false}
})
c.connect().then(async () => {
  const r = await c.query(`
    SELECT c.id, c.tourist_id, c.buddy_id,
           tp.full_name as tourist_name, bp.full_name as buddy_name,
           (SELECT COUNT(*) FROM public.messages WHERE conversation_id = c.id) as msg_count
    FROM public.conversations c
    JOIN public.profiles tp ON tp.id = c.tourist_id
    JOIN public.profiles bp ON bp.id = c.buddy_id
  `)
  console.log('All conversations:')
  for (const row of r.rows) {
    console.log(`  ${row.id.slice(0,8)} | ${row.tourist_name} ↔ ${row.buddy_name} | ${row.msg_count} messages`)
  }
  await c.end()
}).catch(e => { console.error(e.message); process.exit(1) })
