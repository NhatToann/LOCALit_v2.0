// Apply a single .sql file via pg directly.
import { Client } from 'pg'
import fs from 'node:fs'
import path from 'node:path'

const file = process.argv[2]
if (!file) {
  console.error('Usage: node scripts/apply-migration.mjs <path-to-sql>')
  process.exit(1)
}

const sql = fs.readFileSync(path.resolve(file), 'utf8')
const c = new Client({
  connectionString:
    'postgresql://postgres:that1arlecchino@db.pqvnjgyqbxlylawwogjv.supabase.co:5432/postgres',
  ssl: { rejectUnauthorized: false },
})
await c.connect()
console.log('Applying', file, '...')
await c.query(sql)
console.log('OK')
await c.end()
