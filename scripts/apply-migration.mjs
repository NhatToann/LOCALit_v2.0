// Apply a migration SQL file via the pg client. Usage:
//   node scripts/apply-migration.mjs scripts/migrations/2026-09-26-email-verifications.sql
import { Client } from 'pg'
import { readFileSync } from 'node:fs'

const HOST = 'db.pqvnjgyqbxlylawwogjv.supabase.co'
const PORT = 5432
const USER = 'postgres'
const DB = 'postgres'
const PW = process.env.DB_PW || 'that1arlecchino'

const file = process.argv[2]
if (!file) {
  console.error('Usage: node scripts/apply-migration.mjs <path-to-sql>')
  process.exit(2)
}

const sql = readFileSync(file, 'utf8')

;(async () => {
  const c = new Client({ host: HOST, port: PORT, user: USER, password: PW, database: DB, ssl: { rejectUnauthorized: false } })
  await c.connect()
  console.log('Applying:', file, '(' + sql.length + ' bytes)')
  try {
    await c.query(sql)
    console.log('OK')
  } catch (e) {
    console.error('FAIL:', e.message)
    process.exit(1)
  }
  await c.end()
})().catch(e => { console.error('FATAL:', e); process.exit(1) })