#!/usr/bin/env node
import { Client } from 'pg'

const pw = process.env.DB_PW || process.env.SUPABASE_DB_PASSWORD
const pg = new Client({ host: 'db.pqvnjgyqbxlylawwogjv.supabase.co', port: 5432, user: 'postgres', password: pw, database: 'postgres', ssl: { rejectUnauthorized: false } })
await pg.connect()

// Lan Pham is now a buddy, delete the leftover tourist row.
const r1 = await pg.query("DELETE FROM public.tourists WHERE id = '11111111-1111-1111-1111-111111111111' RETURNING id")
console.log('Lan Pham tourist row:', r1.rows)

// John Doe — first script kept buddy, deleted tourist. Verify.
const r2 = await pg.query("SELECT id, nationality FROM public.tourists WHERE id = 'aaaa1111-1111-1111-1111-111111111111'")
console.log('John Doe tourist row:', r2.rows)
if (r2.rows.length > 0) {
  await pg.query("DELETE FROM public.tourists WHERE id = 'aaaa1111-1111-1111-1111-111111111111'")
  console.log('  - deleted John Doe tourist row')
}

// Also delete any duplicate swipes from the previous test session
// for the smoke test user — but we don't need that.

await pg.end()
