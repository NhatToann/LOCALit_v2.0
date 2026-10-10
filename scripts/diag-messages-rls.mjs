import { Client } from 'pg'
const c = new Client({
  connectionString: 'postgresql://postgres:that1arlecchino@db.pqvnjgyqbxlylawwogjv.supabase.co:5432/postgres',
  ssl: { rejectUnauthorized: false },
})
c.connect()
  .then(() =>
    c.query(
      "SELECT polname, polcmd, polpermissive, pg_get_expr(polqual, polrelid) AS using_clause FROM pg_policy WHERE polrelid = 'public.messages'::regclass",
    ),
  )
  .then((r) => {
    console.log(JSON.stringify(r.rows, null, 2))
    c.end()
  })
