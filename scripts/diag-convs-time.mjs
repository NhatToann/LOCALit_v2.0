import pg from 'pg'
const {Client} = pg
const c = new Client({
  connectionString:'postgresql://postgres:that1arlecchino@db.pqvnjgyqbxlylawwogjv.supabase.co:5432/postgres',
  ssl:{rejectUnauthorized:false}
})
c.connect().then(async () => {
  const r = await c.query(`
    SELECT c.id, c.created_at, c.updated_at,
           tp.full_name as tourist_name, bp.full_name as buddy_name
    FROM public.conversations c
    JOIN public.profiles tp ON tp.id = c.tourist_id
    JOIN public.profiles bp ON bp.id = c.buddy_id
    ORDER BY c.created_at DESC
    LIMIT 20
  `)
  console.log('Conversations by created_at (newest first):')
  for (const row of r.rows) {
    console.log(`  [${row.created_at.toISOString()}] ${row.id.slice(0,8)} | ${row.tourist_name} ↔ ${row.buddy_name}`)
  }
  await c.end()
}).catch(e => { console.error(e.message); process.exit(1) })
