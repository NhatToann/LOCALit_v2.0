#!/usr/bin/env node
/**
 * Apply supabase/migrations/*.sql to the Supabase project.
 * Reads DATABASE_URL from .env.local or process.env, runs each migration
 * file in alphabetical order. Idempotent — safe to re-run.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { Client } from 'pg'

const MIGRATIONS_DIR = resolve(process.cwd(), 'supabase/migrations')

function loadEnv() {
  try {
    const envFile = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8')
    for (const line of envFile.split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/)
      if (m && !process.env[m[1]]) {
        process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '')
      }
    }
  } catch {
    /* .env.local optional */
  }
}

async function main() {
  loadEnv()
  const dbUrl =
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    `postgresql://postgres:${process.env.SUPABASE_DB_PASSWORD || process.env.DB_PW}@db.${process.env.SUPABASE_PROJECT_REF || 'pqvnjgyqbxlylawwogjv'}.supabase.co:5432/postgres`

  const client = new Client({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false },
  })

  await client.connect()
  console.log('Connected to Postgres')

  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort()
  console.log(`Found ${files.length} migration files`)

  for (const file of files) {
    const path = join(MIGRATIONS_DIR, file)
    const sql = readFileSync(path, 'utf8')
    console.log(`\n--- ${file} ---`)
    try {
      await client.query(sql)
      console.log(`OK ${file}`)
    } catch (err) {
      const msg = String(err.message || '')
      // Already-applied errors: "already exists", "duplicate key", "does not exist" for DROP
      if (/already exists|duplicate|does not exist/i.test(msg)) {
        console.log(`SKIP ${file} (already applied): ${msg.split('\n')[0]}`)
        continue
      }
      console.error(`FAIL ${file}: ${err.message}`)
      await client.end()
      process.exit(1)
    }
  }

  await client.end()
  console.log('\nAll migrations applied.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
