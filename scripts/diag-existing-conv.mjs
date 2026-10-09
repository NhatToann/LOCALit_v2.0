// scripts/diag-existing-conv.mjs
// Verify: does the existing-conversation check in openConversationWithBuddy actually find existing rows?
import { Client } from 'pg'
const DB = `postgresql://postgres:${process.env.SUPABASE_DB_PASSWORD}@db.pqvnjgyqbxlylawwogjv.supabase.co:5432/postgres`
const client = new Client({ connectionString: DB, ssl: { rejectUnauthorized: false } })
await client.connect()

const LAN = '11111111-1111-1111-1111-111111111111'
const TOAN = 'f2df98b0-96cf-451d-9d85-5060ddc1ca01'

console.log('[1] Direct SQL: any conversation between Lan and Toan?')
const { rows: all } = await client.query(
  `SELECT id, tourist_id, buddy_id, created_at FROM public.conversations
   WHERE (tourist_id = $1 AND buddy_id = $2) OR (tourist_id = $2 AND buddy_id = $1)`,
  [LAN, TOAN]
)
console.log('  Found:', all.length, 'row(s)')
all.forEach(r => console.log('   -', r))

console.log('\n[2] Test the exact PostgREST .or() filter the app uses:')
const { rows: orFilter } = await client.query(
  `SELECT id FROM public.conversations
   WHERE (
     (tourist_id = $1 AND buddy_id = $2)
     OR (tourist_id = $2 AND buddy_id = $1)
   )`,
  [LAN, TOAN]
)
console.log('  Found via .or() pattern:', orFilter.length, 'row(s)')

console.log('\n[3] Same query but with maybeSingle semantics (LIMIT 1):')
const { rows: single } = await client.query(
  `SELECT id FROM public.conversations
   WHERE (
     (tourist_id = $1 AND buddy_id = $2)
     OR (tourist_id = $2 AND buddy_id = $1)
   ) LIMIT 1`,
  [LAN, TOAN]
)
console.log('  Found via .or() + maybeSingle:', single.length, 'row(s)')

console.log('\n[4] Cleanup all conversations between Lan and Toan:')
const { rowCount } = await client.query(
  `DELETE FROM public.conversations
   WHERE (tourist_id = $1 AND buddy_id = $2) OR (tourist_id = $2 AND buddy_id = $1)`,
  [LAN, TOAN]
)
console.log('  Deleted:', rowCount, 'row(s)')

console.log('\n[5] Re-test: any conversation between Lan and Toan after cleanup?')
const { rows: after } = await client.query(
  `SELECT id FROM public.conversations
   WHERE (tourist_id = $1 AND buddy_id = $2) OR (tourist_id = $2 AND buddy_id = $1)`,
  [LAN, TOAN]
)
console.log('  Found:', after.length, 'row(s)')

await client.end()
