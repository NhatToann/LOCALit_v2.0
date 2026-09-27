/**
 * Apply a SQL migration file directly to the Supabase Postgres database.
 *
 * Usage:
 *   $env:SUPABASE_DB_PASSWORD="..."; node scripts/apply-migration.mjs supabase/migrations/<file>.sql
 */
import { readFileSync } from 'node:fs'
import { Client } from 'pg'

const file = process.argv[2]
if (!file) {
  console.error('Usage: node scripts/apply-migration.mjs <file.sql>')
  process.exit(1)
}

const password = process.env.SUPABASE_DB_PASSWORD || process.env.DB_PW
if (!password) {
  console.error('Missing SUPABASE_DB_PASSWORD env var.')
  process.exit(1)
}

const sql = readFileSync(file, 'utf8')

const client = new Client({
  connectionString: `postgresql://postgres:${password}@db.pqvnjgyqbxlylawwogjv.supabase.co:5432/postgres`,
  ssl: { rejectUnauthorized: false },
})

console.log(`Applying ${file} (${sql.length} bytes)…`)
await client.connect()
try {
  await client.query(sql)
  console.log('OK')
} catch (err) {
  console.error('FAILED:', err.message)
  process.exit(2)
} finally {
  await client.end()
}
