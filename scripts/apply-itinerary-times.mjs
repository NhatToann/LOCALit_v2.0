#!/usr/bin/env node
/**
 * Apply a SQL migration to Supabase via the pg driver.
 * Usage:
 *   node scripts/apply-itinerary-times.mjs
 */
import { readFile } from 'node:fs/promises'
import { Client } from 'pg'
import path from 'node:path'

const DB_URL = process.env.SUPABASE_DB_URL
if (!DB_URL) {
  console.error('Set SUPABASE_DB_URL before running this script.')
  console.error('Example: postgresql://postgres:<pw>@db.pqvnjgyqbxlylawwogjv.supabase.co:5432/postgres')
  process.exit(1)
}

const file = process.argv[2] ?? path.join(
  'supabase',
  'migrations',
  '2026-10-09-itinerary-custom-times.sql',
)

const sql = await readFile(file, 'utf8')
const client = new Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } })
await client.connect()
try {
  console.log(`[apply] ${file}`)
  await client.query(sql)
  console.log('[apply] OK')
} catch (err) {
  console.error('[apply] FAILED:', err.message)
  process.exitCode = 1
} finally {
  await client.end()
}
