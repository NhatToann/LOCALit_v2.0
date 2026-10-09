// scripts/diag-ensure-conv.mjs
// Idempotent: ensure John Doe (tourist) and Lan Pham (buddy) have a
// conversation row so /chat has something to click.
import { Client } from 'pg'
const c = new Client({
  connectionString:
    'postgresql://postgres:that1arlecchino@db.pqvnjgyqbxlylawwogjv.supabase.co:5432/postgres',
  ssl: { rejectUnauthorized: false },
})
await c.connect()
const john = 'aaaa1111-1111-1111-1111-111111111111'
const lan = '11111111-1111-1111-1111-111111111111'
// Lan is the buddy
const ins = await c.query(
  `INSERT INTO public.conversations (tourist_id, buddy_id) VALUES ($1, $2)
   ON CONFLICT DO NOTHING RETURNING id`,
  [john, lan],
)
console.log('inserted:', ins.rows)
const all = await c.query(
  `SELECT id, tourist_id, buddy_id, last_message_at
   FROM public.conversations
   WHERE tourist_id IN ($1, $2) OR buddy_id IN ($1, $2)
   ORDER BY last_message_at DESC NULLS LAST`,
  [john, lan],
)
console.log('total:', all.rows.length, 'rows')
for (const r of all.rows) console.log(' ', r)
await c.end()
