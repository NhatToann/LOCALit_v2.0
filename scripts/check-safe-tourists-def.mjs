import { Client } from 'pg'
const pg = new Client({
  connectionString: 'postgresql://postgres:that1arlecchino@db.pqvnjgyqbxlylawwogjv.supabase.co:5432/postgres',
  ssl: { rejectUnauthorized: false },
})
await pg.connect()
const v = await pg.query("SELECT view_definition FROM information_schema.views WHERE table_schema = 'public' AND table_name = 'safe_tourists_with_location'")
console.log(v.rows[0]?.view_definition)
await pg.end()
