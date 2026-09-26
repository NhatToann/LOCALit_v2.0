import { Client } from 'pg'
const HOST = 'db.pqvnjgyqbxlylawwogjv.supabase.co'
const PORT = 5432
const DB_USER = 'postgres'
const DB_NAME = 'postgres'
const DB_PW = process.env.DB_PW || 'that1arlecchino'
;(async () => {
  const pg = new Client({ host: HOST, port: PORT, user: DB_USER, password: DB_PW, database: DB_NAME, ssl: { rejectUnauthorized: false } })
  await pg.connect()
  const r = await pg.query(`SELECT id, email, email_confirmed_at, created_at FROM auth.users WHERE email LIKE '%sophie%' ORDER BY created_at DESC LIMIT 5`)
  console.log('sophie auth:', JSON.stringify(r.rows, null, 2))
  const p = await pg.query(`SELECT id, email, role, full_name, phone FROM public.profiles WHERE email LIKE '%sophie%' ORDER BY created_at DESC LIMIT 5`)
  console.log('sophie profiles:', JSON.stringify(p.rows, null, 2))
  await pg.end()
})()
