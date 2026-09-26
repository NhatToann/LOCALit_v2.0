import { Client } from 'pg'
const HOST = 'db.pqvnjgyqbxlylawwogjv.supabase.co'
const PORT = 5432
const DB_USER = 'postgres'
const DB_NAME = 'postgres'
const DB_PW = process.env.DB_PW || 'that1arlecchino'
;(async () => {
  const pg = new Client({ host: HOST, port: PORT, user: DB_USER, password: DB_PW, database: DB_NAME, ssl: { rejectUnauthorized: false } })
  await pg.connect()
  const r = await pg.query(`SELECT id, email, created_at FROM auth.users WHERE email LIKE '%hoa%' OR email LIKE '%signup%' ORDER BY created_at DESC LIMIT 5`)
  console.log('matching users:', JSON.stringify(r.rows, null, 2))
  const t = await pg.query(`SELECT id, email, created_at FROM auth.users ORDER BY created_at DESC LIMIT 3`)
  console.log('most recent 3 users:', JSON.stringify(t.rows, null, 2))
  await pg.end()
})()
