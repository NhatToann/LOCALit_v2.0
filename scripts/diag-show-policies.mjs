import { Client } from 'pg'
const HOST = 'db.pqvnjgyqbxlylawwogjv.supabase.co'
const PORT = 5432
const DB_USER = 'postgres'
const DB_NAME = 'postgres'
const DB_PW = process.env.DB_PW || 'that1arlecchino'
;(async () => {
  const pg = new Client({ host: HOST, port: PORT, user: DB_USER, password: DB_PW, database: DB_NAME, ssl: { rejectUnauthorized: false } })
  await pg.connect()
  const r = await pg.query(`SELECT schemaname, tablename, policyname, permissive, cmd, roles, qual, with_check FROM pg_policies WHERE tablename IN ('tourists', 'profiles', 'buddies') ORDER BY tablename, policyname`)
  for (const row of r.rows) console.log(JSON.stringify(row, null, 2))
  await pg.end()
})()
