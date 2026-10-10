import { Client } from 'pg'
const c = new Client({
  connectionString: 'postgresql://postgres:that1arlecchino@db.pqvnjgyqbxlylawwogjv.supabase.co:5432/postgres',
  ssl: { rejectUnauthorized: false },
})
c.connect()
  .then(() =>
    c.query(
      "SELECT pubname, schemaname, tablename FROM pg_publication_tables WHERE pubname = 'supabase_realtime' ORDER BY tablename",
    ),
  )
  .then((r) => {
    console.log(JSON.stringify(r.rows, null, 2))
    c.end()
  })
