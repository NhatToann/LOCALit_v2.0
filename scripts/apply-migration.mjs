// Apply a single SQL migration file to Supabase Postgres.
import { Client } from 'pg'
import fs from 'node:fs'
import path from 'node:path'

const file = process.argv[2]
if (!file) {
  console.error('Usage: node scripts/apply-migration.mjs <path-to-sql>')
  process.exit(1)
}
const abs = path.isAbsolute(file) ? file : path.join(process.cwd(), file)
const sql = fs.readFileSync(abs, 'utf8')

const c = new Client({
  connectionString: 'postgresql://postgres:that1arlecchino@db.pqvnjgyqbxlylawwogjv.supabase.co:5432/postgres',
  ssl: { rejectUnauthorized: false },
})
await c.connect()
try {
  await c.query(sql)
  console.log('OK applied', path.basename(abs))
} catch (e) {
  console.error('FAIL', e.message)
  process.exit(1)
} finally {
  await c.end()
}
