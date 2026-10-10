import pg from 'pg'
const {Client} = pg
const c = new Client({
  connectionString:'postgresql://postgres:that1arlecchino@db.pqvnjgyqbxlylawwogjv.supabase.co:5432/postgres',
  ssl:{rejectUnauthorized:false}
})
c.connect().then(async () => {
  const pub = await c.query(`SELECT pubname, puballtables FROM pg_publication WHERE pubname = 'supabase_realtime'`)
  console.log('=== supabase_realtime publication ===')
  if (pub.rows[0]?.puballtables) {
    console.log('  FOR ALL TABLES (everything streams)')
  } else {
    const t = await c.query(`
      SELECT c.relname
      FROM pg_publication_tables pt
      JOIN pg_class c ON c.relname = pt.tablename
      JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = pt.schemaname
      WHERE pt.pubname = 'supabase_realtime'
      ORDER BY c.relname
    `)
    console.log('  Tables in publication:', t.rows.map(r => r.relname).join(', '))
  }

  console.log('\n=== RLS enabled on messages? ===')
  const rls = await c.query(`SELECT relrowsecurity, relforcerowsecurity FROM pg_class WHERE relname='messages' AND relnamespace='public'::regnamespace`)
  console.log(' ', rls.rows[0])

  console.log('\n=== replica identity (needed for UPDATE/DELETE payloads) ===')
  const ri = await c.query(`SELECT relreplident FROM pg_class WHERE relname='messages' AND relnamespace='public'::regnamespace`)
  console.log(' ', ri.rows[0])

  await c.end()
}).catch(e => { console.error(e.message); process.exit(1) })