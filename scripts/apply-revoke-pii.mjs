import { Client } from 'pg'
import { readFileSync } from 'node:fs'

const c = new Client({
  connectionString: `postgresql://postgres:${process.env.DB_PW}@db.pqvnjgyqbxlylawwogjv.supabase.co:5432/postgres`,
  ssl: { rejectUnauthorized: false },
})
await c.connect()
const sql = readFileSync('supabase/migrations/2026-09-26_revoke_pii_columns.sql', 'utf8')
console.log(`Applying migration (${sql.length} bytes)...`)
try {
  await c.query(sql)
  console.log('OK')
} catch (e) {
  console.error('FAILED:', e.message)
  process.exitCode = 1
}
await c.end()
