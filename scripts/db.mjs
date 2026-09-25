#!/usr/bin/env node
/**
 * LOCALit DB apply script.
 *
 * Usage:
 *   DB_PW=... node scripts/db.mjs --apply-schema
 *   DB_PW=... node scripts/db.mjs --apply-seed
 *   DB_PW=... node scripts/db.mjs --verify
 */
import { Client } from 'pg'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const ROOT = resolve(__dirname, '..')

const PROJECT_REF = 'pqvnjgyqbxlylawwogjv'
const HOST = `db.${PROJECT_REF}.supabase.co`
const PORT = 5432
const DB_USER = 'postgres'
const DB_NAME = 'postgres'

function getPassword() {
  const pw = process.env.DB_PW || process.env.SUPABASE_DB_PASSWORD
  if (!pw) {
    throw new Error('Set DB_PW env var (or SUPABASE_DB_PASSWORD) before running this script.')
  }
  return pw
}

function buildClient() {
  return new Client({
    host: HOST,
    port: PORT,
    user: DB_USER,
    password: getPassword(),
    database: DB_NAME,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 15000,
  })
}

async function applySchema(client) {
  const sql = readFileSync(resolve(ROOT, 'supabase', 'schema.sql'), 'utf8')
  console.log('[schema] Applying schema.sql ...')
  await client.query(sql)
  console.log('[schema] Done.')
}

async function applySeed(client) {
  const sql = readFileSync(resolve(ROOT, 'supabase', 'seed.sql'), 'utf8')
  console.log('[seed] Applying seed.sql ...')
  await client.query(sql)
  console.log('[seed] Done.')
}

async function verify(client) {
  const tables = ['profiles', 'tourists', 'buddies', 'connections', 'trips', 'trip_stops', 'conversations', 'messages', 'location_updates', 'reviews']
  for (const t of tables) {
    try {
      const { rows } = await client.query(`SELECT COUNT(*)::int AS c FROM public.${t}`)
      console.log(`[verify] ${t.padEnd(20)} ${rows[0].c}`)
    } catch (err) {
      console.log(`[verify] ${t.padEnd(20)} ERROR: ${err.message}`)
    }
  }
}

async function main() {
  const arg = process.argv[2]
  const client = buildClient()
  await client.connect()
  try {
    switch (arg) {
      case '--apply-schema':
        await applySchema(client)
        await verify(client)
        break
      case '--apply-seed':
        await applySeed(client)
        await verify(client)
        break
      case '--verify':
        await verify(client)
        break
      case '--all':
        await applySchema(client)
        await applySeed(client)
        await verify(client)
        break
      default:
        console.log('Usage:')
        console.log('  node scripts/db.mjs --apply-schema')
        console.log('  node scripts/db.mjs --apply-seed')
        console.log('  node scripts/db.mjs --verify')
        console.log('  node scripts/db.mjs --all   (schema + seed + verify)')
        process.exitCode = 1
    }
  } finally {
    await client.end()
  }
}

main().catch((err) => {
  console.error('[db.mjs] Failed:', err.message)
  process.exit(1)
})
