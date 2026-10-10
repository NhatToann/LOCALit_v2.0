import pg from 'pg'
const {Client} = pg
const c = new Client({
  connectionString:'postgresql://postgres:that1arlecchino@db.pqvnjgyqbxlylawwogjv.supabase.co:5432/postgres',
  ssl:{rejectUnauthorized:false}
})
c.connect().then(async () => {
  const r = await c.query(`
    SELECT pubname, schemaname, tablename
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
    ORDER BY tablename
  `)
  console.log('Tables in supabase_realtime publication:')
  for (const row of r.rows) {
    console.log(`  ${row.schemaname}.${row.tablename}`)
  }
  await c.end()
}).catch(e => { console.error(e.message); process.exit(1) })
