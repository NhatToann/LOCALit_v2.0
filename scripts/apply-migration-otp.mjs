// scripts/apply-migration-otp.mjs
// Apply the new email_verifications migration to production.
// Idempotent: re-running is safe (CREATE TABLE IF NOT EXISTS etc.)
import pg from 'pg'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const { Client } = pg
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const migrationPath = path.join(
  __dirname,
  '..',
  'supabase',
  'migrations',
  '2026-09-27-restore-email-verifications.sql',
)

const sql = fs.readFileSync(migrationPath, 'utf8')

const c = new Client({
  connectionString:
    'postgresql://postgres:that1arlecchino@db.pqvnjgyqbxlylawwogjv.supabase.co:5432/postgres',
  ssl: { rejectUnauthorized: false },
})

await c.connect()
console.log('Applying migration…')
await c.query(sql)
console.log('Migration applied successfully.\n')

// Verify the new schema
const verify = await c.query(`
  SELECT column_name, data_type, is_nullable
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'email_verifications'
  ORDER BY ordinal_position
`)
console.log('email_verifications schema:')
console.table(verify.rows)

const rls = await c.query(`
  SELECT relname, relrowsecurity, relforcerowsecurity
  FROM pg_class WHERE relname = 'email_verifications' AND relnamespace = 'public'::regnamespace
`)
console.log('RLS:', rls.rows)

await c.end()
