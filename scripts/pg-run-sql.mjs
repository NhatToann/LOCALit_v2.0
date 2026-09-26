// Run a SQL file using pg.
import { Client } from 'pg'
import fs from 'node:fs'
const HOST = 'db.pqvnjgyqbxlylawwogjv.supabase.co'
const PORT = 5432
const DB_USER = 'postgres'
const DB_NAME = 'postgres'
const DB_PW = process.env.DB_PW || 'that1arlecchino'

const file = process.argv[2]
if (!file) {
  console.error('Usage: node pg-run-sql.mjs <sql-file>')
  process.exit(1)
}
const sql = fs.readFileSync(file, 'utf8')

const pg = new Client({ host: HOST, port: PORT, user: DB_USER, password: DB_PW, database: DB_NAME, ssl: { rejectUnauthorized: false } })
async function main() {
  await pg.connect()
  console.log(`[pg-run-sql] Running ${file} (${sql.length} bytes)`)
  try {
    await pg.query(sql)
    console.log('[pg-run-sql] OK')
  } catch (e) {
    console.error('[pg-run-sql] FAILED:', e.message)
    process.exit(1)
  }
  await pg.end()
}
main().catch(e => { console.error(e); process.exit(1) })
