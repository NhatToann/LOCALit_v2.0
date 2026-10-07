import { Client } from 'pg'
import fs from 'fs'
import path from 'path'

const DB_PW = process.env.SUPABASE_DB_PASSWORD || process.env.DB_PW
if (!DB_PW) { console.error('Missing DB_PW'); process.exit(1) }
const client = new Client({
  host: 'db.pqvnjgyqbxlylawwogjv.supabase.co',
  port: 5432,
  user: 'postgres',
  password: DB_PW,
  database: 'postgres',
  ssl: { rejectUnauthorized: false },
})
;(async () => {
  await client.connect()
  const sql = fs.readFileSync(
    path.join(process.cwd(), 'supabase/migrations/2026-11-07-create-safe-tourists-view.sql'),
    'utf8',
  )
  console.log('→ create-safe-tourists-view')
  await client.query(sql)
  console.log('OK')
  await client.end()
})().catch((e) => { console.error('FAIL', e.message); process.exit(1) })