import { Client } from 'pg'
import { readFileSync } from 'node:fs'

const files = [
  'supabase/migrations/2026-09-27-itinerary-v2.sql',
  'supabase/migrations/2026-09-27-chat-v2.sql',
]

const c = new Client({
  connectionString: `postgresql://postgres:${process.env.SUPABASE_DB_PASSWORD}@db.pqvnjgyqbxlylawwogjv.supabase.co:5432/postgres`,
  ssl: { rejectUnauthorized: false },
})

await c.connect()
for (const f of files) {
  console.log(`\n=== Applying ${f} ===`)
  const sql = readFileSync(f, 'utf8')
  try {
    await c.query(sql)
    console.log(`OK ${f}`)
  } catch (e) {
    console.error(`FAILED ${f}:`, e.message)
    process.exitCode = 1
  }
}
await c.end()
