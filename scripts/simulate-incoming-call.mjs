/**
 * Simulate an incoming call from John to Lan by inserting a row
 * directly into pending_calls. The receiver (Lan) must see the
 * Accept/Decline popup immediately. Before this script we verified
 * (2026-10-02) that the popup would silently auto-accept when the
 * receiver was on /chat (a critical-mass UX failure). The fix
 * removes the auto-route and shows the popup unconditionally.
 */
import { Client } from 'pg'

const client = new Client({
  connectionString: `postgresql://postgres:that1arlecchino@db.pqvnjgyqbxlylawwogjv.supabase.co:5432/postgres`,
  ssl: { rejectUnauthorized: false },
})
await client.connect()

const JOHN_ID = 'aaaa1111-1111-1111-1111-111111111111' // tourist
const LAN_ID = '11111111-1111-1111-1111-111111111111' // buddy
const CONV_ID = '347f782e-e6bc-4d2b-b3a4-7453d301dcba'

// Cleanup any old ringing rows
await client.query(
  `DELETE FROM pending_calls WHERE callee_id=$1 AND status='ringing'`,
  [LAN_ID],
)

const { rows } = await client.query(
  `INSERT INTO pending_calls
   (conversation_id, caller_id, callee_id, status, type, room_name)
   VALUES ($1, $2, $3, 'ringing', 'voice', $4)
   RETURNING id`,
  [CONV_ID, JOHN_ID, LAN_ID, `call:${CONV_ID}`],
)

console.log(`Inserted pending_call: ${rows[0].id}`)
await client.end()