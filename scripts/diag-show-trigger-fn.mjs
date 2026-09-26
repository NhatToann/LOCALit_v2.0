import { Client } from 'pg'
const HOST = 'db.pqvnjgyqbxlylawwogjv.supabase.co'
const PORT = 5432
const DB_USER = 'postgres'
const DB_NAME = 'postgres'
const DB_PW = process.env.DB_PW || 'that1arlecchino'
;(async () => {
  const pg = new Client({ host: HOST, port: PORT, user: DB_USER, password: DB_PW, database: DB_NAME, ssl: { rejectUnauthorized: false } })
  await pg.connect()
  const r = await pg.query(`SELECT pg_get_functiondef(oid) AS def FROM pg_proc WHERE proname = 'handle_new_user'`)
  console.log('=== handle_new_user body ===')
  console.log(r.rows[0].def)
  await pg.end()
})()
