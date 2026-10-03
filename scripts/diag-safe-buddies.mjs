import { Client } from 'pg'
const c = new Client({
  host: 'db.pqvnjgyqbxlylawwogjv.supabase.co',
  port: 5432,
  user: 'postgres',
  password: 'that1arlecchino',
  database: 'postgres',
  ssl: { rejectUnauthorized: false },
})
c.connect()
  .then(() =>
    c.query(
      "SELECT column_name, data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='safe_buddies' ORDER BY ordinal_position"
    )
  )
  .then((r) => {
    console.log('--- safe_buddies columns ---')
    console.log(JSON.stringify(r.rows, null, 2))
    return c.query("SELECT id, location_city FROM public.safe_buddies WHERE id='44444444-4444-4444-4444-444444444444'")
  })
  .then((r) => {
    console.log('\n--- Linh Tran row from view ---')
    console.log(JSON.stringify(r.rows, null, 2))
    c.end()
  })
  .catch((e) => {
    console.error(e.message)
    c.end()
  })