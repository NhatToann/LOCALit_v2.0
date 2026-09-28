// scripts/apply-call-event-constraint.mjs
// Applies the migration that allows message_type='call_event'.
// Idempotent: safe to re-run.
import pg from 'pg'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const path = resolve(here, '..', 'supabase', 'migrations', '2026-09-28-allow-call-event-message-type.sql')

const url = process.env.SUPABASE_URL
const pw = process.env.SUPABASE_DB_PASSWORD
if (!url || !pw) {
  console.error('Set SUPABASE_URL and SUPABASE_DB_PASSWORD.')
  process.exit(1)
}
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
const host = `${new URL(url).hostname.split('.')[0]}.supabase.co`

const c = new pg.Client({
  connectionString: `postgresql://postgres:${pw}@db.${host}:5432/postgres`,
  ssl: { rejectUnauthorized: false },
})
await c.connect()
try {
  const sql = readFileSync(path, 'utf8')
  console.log(`Applying ${path}\n---`)
  console.log(sql)
  console.log('---\n')
  await c.query(sql)
  // Verify
  const { rows } = await c.query(`
    SELECT pg_get_constraintdef(c.oid) AS def
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    WHERE t.relname = 'messages' AND contype = 'c' AND conname = 'messages_message_type_check'
  `)
  console.log('New constraint definition:\n ', rows[0]?.def)
} finally {
  await c.end()
}
