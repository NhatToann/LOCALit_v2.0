// scripts/diag-fk-actual.mjs — reproduce the exact FK violation user reported
import { Client } from 'pg'
const DB = `postgresql://postgres:${process.env.SUPABASE_DB_PASSWORD}@db.pqvnjgyqbxlylawwogjv.supabase.co:5432/postgres`
const LAN = '11111111-1111-1111-1111-111111111111'   // role=buddy
const JOHN = 'aaaa1111-1111-1111-1111-111111111111' // role=buddy per profiles table (mismatch!)

const client = new Client({ connectionString: DB, ssl: { rejectUnauthorized: false } })
await client.connect()

// Cleanup any leftover test row
await client.query(
  `DELETE FROM public.conversations WHERE (tourist_id = $1 AND buddy_id = $2) OR (tourist_id = $2 AND buddy_id = $1)`,
  [LAN, JOHN]
)

// The bug repro: Lan (buddy) opens /chat?buddy=<john-id>
// Per app/chat/page.tsx:534: insertPayload = (myRole==='buddy')
//   { tourist_id: partnerId, buddy_id: myId }
//   = { tourist_id: JOHN, buddy_id: LAN }
console.log('\n[REPRO] Insert {tourist_id: JOHN, buddy_id: LAN} as app code does on /chat?buddy=<john>:')
try {
  await client.query(
    `INSERT INTO public.conversations (tourist_id, buddy_id) VALUES ($1, $2)`,
    [JOHN, LAN]
  )
  console.log('  unexpected success — no FK violation')
} catch (e) {
  console.log('  REPRODUCED FK violation:', e.code, '-', e.message.split('\n')[0])
  console.log('  detail:', e.detail ?? '(none)')
}

// Cleanup
await client.query(
  `DELETE FROM public.conversations WHERE (tourist_id = $1 AND buddy_id = $2) OR (tourist_id = $2 AND buddy_id = $1)`,
  [LAN, JOHN]
)

// Try the opposite assumption (john is in buddy_id column) — would also fail
console.log('\n[REPRO 2] Insert {tourist_id: LAN, buddy_id: JOHN} (opposite assignment):')
try {
  await client.query(
    `INSERT INTO public.conversations (tourist_id, buddy_id) VALUES ($1, $2)`,
    [LAN, JOHN]
  )
  console.log('  success — this would work if app placed john in buddy_id')
} catch (e) {
  console.log('  FAIL:', e.code, '-', e.message.split('\n')[0])
}

await client.end()
