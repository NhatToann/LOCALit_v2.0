import pg from 'pg'
const {Client} = pg
const c = new Client({
  connectionString:'postgresql://postgres:that1arlecchino@db.pqvnjgyqbxlylawwogjv.supabase.co:5432/postgres',
  ssl:{rejectUnauthorized:false}
})
c.connect().then(async () => {
  // Get all conversations involving Phan Nhat Toan
  const r = await c.query(`
    SELECT c.id as conv_id, c.tourist_id, c.buddy_id,
           tp.full_name as tourist_name, bp.full_name as buddy_name,
           c.created_at
    FROM public.conversations c
    JOIN public.profiles tp ON tp.id = c.tourist_id
    JOIN public.profiles bp ON bp.id = c.buddy_id
    WHERE tp.full_name = $1 OR bp.full_name = $1
  `, ['Phan Nhật Toàn'])
  console.log('Conversations involving Phan Nhật Toàn:')
  for (const row of r.rows) {
    const count = await c.query('SELECT COUNT(*) as n FROM public.messages WHERE conversation_id = $1', [row.conv_id])
    console.log(`  ${row.conv_id.slice(0,8)} | ${row.tourist_name} ↔ ${row.buddy_name} | ${count.rows[0].n} messages`)
  }
  await c.end()
}).catch(e => { console.error(e.message); process.exit(1) })
