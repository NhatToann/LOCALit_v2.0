#!/usr/bin/env node
/**
 * Apply a SQL migration file to the Supabase database using the postgres
 * connection string. Idempotent — re-running is safe.
 */
import { Client } from 'pg'
import fs from 'node:fs'

const DB = `postgresql://postgres:${process.env.SUPABASE_DB_PASSWORD ?? 'that1arlecchino'}@db.pqvnjgyqbxlylawwogjv.supabase.co:5432/postgres`

const file = process.argv[2]
if (!file) {
  console.error('Usage: node scripts/apply-migration.mjs <sql-file>')
  process.exit(1)
}
const sql = fs.readFileSync(file, 'utf8')

const client = new Client({
  connectionString: DB,
  ssl: { rejectUnauthorized: false },
})

console.log(`[migrate] applying ${file}...`)
try {
  await client.connect()
  await client.query(sql)
  console.log('[migrate] ✓ applied')
} catch (e) {
  console.error('[migrate] ✗ error:', e.message)
  process.exit(1)
} finally {
  await client.end()
}
