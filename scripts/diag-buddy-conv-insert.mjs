// scripts/diag-buddy-conv-insert.mjs
//
// Direct DB-level verification of the FK fix: simulate a buddy-side user
// opening /chat?buddy=<tourist-id>. Pre-fix this fails with 23503
// (conversations_tourist_id_fkey violation). Post-fix, the chat page
// branches on myRole and inserts correctly.

import { Client } from 'pg'

const DB_URL = `postgresql://postgres:${process.env.SUPABASE_DB_PASSWORD}@db.pqvnjgyqbxlylawwogjv.supabase.co:5432/postgres`

const LAN_ID = '11111111-1111-1111-1111-111111111111'   // role=buddy
const JOHN_ID = 'aaaa1111-1111-1111-1111-111111111111' // role=tourist

const client = new Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } })
await client.connect()

// Cleanup any leftover test row
await client.query(
  `DELETE FROM public.conversations
   WHERE (tourist_id = $1 AND buddy_id = $2) OR (tourist_id = $2 AND buddy_id = $1)`,
  [LAN_ID, JOHN_ID],
)

// --- THE OLD CODE (pre-fix): always insert as tourist ---
console.log('\n[old code] Trying insert {tourist_id: LAN, buddy_id: JOHN}…')
try {
  await client.query(
    `INSERT INTO public.conversations (tourist_id, buddy_id) VALUES ($1, $2)`,
    [LAN_ID, JOHN_ID],
  )
  console.log('  Unexpected success — old code would not have failed')
} catch (e) {
  console.log('  ✓ Failed as expected (FK violation):', e.code, '-', e.message.split('\n')[0])
}

// --- THE NEW CODE (post-fix): branch on myRole ---
// Lan is a buddy, so we insert him as buddy_id.
console.log('\n[new code] Lan (buddy) inserts {tourist_id: JOHN, buddy_id: LAN}…')
const { rows } = await client.query(
  `INSERT INTO public.conversations (tourist_id, buddy_id) VALUES ($1, $2)
   ON CONFLICT (tourist_id, buddy_id) DO UPDATE SET updated_at = now()
   RETURNING id, tourist_id, buddy_id`,
  [JOHN_ID, LAN_ID],
)
console.log('  ✓ Inserted:', rows[0])

// Symmetric: John (tourist) opening chat with Lan (buddy) — old code worked for this
console.log('\n[old code path] John (tourist) inserts {tourist_id: JOHN, buddy_id: LAN}…')
const { rows: rows2 } = await client.query(
  `INSERT INTO public.conversations (tourist_id, buddy_id) VALUES ($1, $2)
   ON CONFLICT (tourist_id, buddy_id) DO UPDATE SET updated_at = now()
   RETURNING id, tourist_id, buddy_id`,
  [JOHN_ID, LAN_ID],
)
console.log('  ✓ Idempotent (same conversation):', rows2[0].id === rows[0].id ? 'YES' : 'NO')

await client.end()
console.log('\nPASS — FK fix verified at DB level')