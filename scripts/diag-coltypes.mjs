import { Client } from 'pg'
const pg = new Client({ host: 'db.pqvnjgyqbxlylawwogjv.supabase.co', port: 5432, user: 'postgres', password: process.env.DB_PW, database: 'postgres', ssl: { rejectUnauthorized: false } })
;(async () => {
  await pg.connect()
  const r = await pg.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='tourists' AND column_name IN ('interests','languages')")
  console.log(JSON.stringify(r.rows))
  await pg.end()
})()
