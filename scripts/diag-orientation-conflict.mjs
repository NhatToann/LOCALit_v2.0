// scripts/diag-orientation-conflict.mjs
// Reproduce 409 Conflict by inserting conversation in opposite orientation
import { Client } from 'pg'
const DB = `postgresql://postgres:${process.env.SUPABASE_DB_PASSWORD}@db.pqvnjgyqbxlylawwogjv.supabase.co:5432/postgres`
const client = new Client({ connectionString: DB, ssl: { rejectUnauthorized: false } })
await client.connect()

const LAN = '11111111-1111-1111-1111-111111111111'      // buddy
const TOAN = 'f2df98b0-96cf-451d-9d85-5060ddc1ca01'     // tourist

// Clean
await client.query(
  `DELETE FROM public.conversations
   WHERE (tourist_id = $1 AND buddy_id = $2) OR (tourist_id = $2 AND buddy_id = $1)`,
  [LAN, TOAN]
)

console.log('[1] Insert (tourist=TOAN, buddy=LAN) — Lan opens chat with Toan:')
const r1 = await client.query(
  `INSERT INTO public.conversations (tourist_id, buddy_id) VALUES ($1, $2) RETURNING id`,
  [TOAN, LAN]
)
console.log('  OK, id:', r1.rows[0].id)

console.log('\n[2] Toan opens chat with Lan — try to insert (tourist=LAN, buddy=TOAN):')
try {
  const r2 = await client.query(
    `INSERT INTO public.conversations (tourist_id, buddy_id) VALUES ($1, $2) RETURNING id`,
    [LAN, TOAN]
  )
  console.log('  OK, id:', r2.rows[0].id)
} catch (e) {
  console.log('  ERROR:', e.message.split('\n')[0])
  console.log('  Code:', e.code, '— this is what PostgREST returns as 409')
}

console.log('\n[3] Check the existing-conversation query app uses:')
const { rows: existing } = await client.query(
  `SELECT id FROM public.conversations
   WHERE (
     (tourist_id = $1 AND buddy_id = $2)
     OR (tourist_id = $2 AND buddy_id = $1)
   ) LIMIT 1`,
  [LAN, TOAN]
)
console.log('  Found via .or() pattern:', existing.length, 'row(s)')
console.log('  Result:', existing[0]?.id ?? 'none')

console.log('\n[4] Cleanup:')
const { rowCount } = await client.query(
  `DELETE FROM public.conversations
   WHERE (tourist_id = $1 AND buddy_id = $2) OR (tourist_id = $2 AND buddy_id = $1)`,
  [LAN, TOAN]
)
console.log('  Deleted:', rowCount, 'row(s)')

await client.end()
