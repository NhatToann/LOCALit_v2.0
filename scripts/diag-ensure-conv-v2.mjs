// scripts/diag-ensure-conv-v2.mjs
// Idempotent: pick the first existing conversation, or ensure one
// exists by inserting via service-role client (pg direct).
import { Client } from 'pg'
const c = new Client({
  connectionString:
    'postgresql://postgres:that1arlecchino@db.pqvnjgyqbxlylawwogjv.supabase.co:5432/postgres',
  ssl: { rejectUnauthorized: false },
})
await c.connect()
const john = 'aaaa1111-1111-1111-1111-111111111111'
const lan = '11111111-1111-1111-1111-111111111111'
// Find John's tourist id and Lan's buddy id
const t = await c.query("SELECT id FROM public.tourists WHERE user_id = $1", [john])
const b = await c.query("SELECT id FROM public.buddies WHERE user_id = $1", [lan])
console.log('john.tourist_id:', t.rows[0]?.id)
console.log('lan.buddy_id:', b.rows[0]?.id)
if (!t.rows[0] || !b.rows[0]) {
  console.log('seed mismatch: john is not a tourist or lan is not a buddy')
  await c.end()
  process.exit(1)
}
const ins = await c.query(
  `INSERT INTO public.conversations (tourist_id, buddy_id) VALUES ($1, $2)
   ON CONFLICT DO NOTHING RETURNING id`,
  [t.rows[0].id, b.rows[0].id],
)
console.log('inserted:', ins.rows)
const all = await c.query(
  `SELECT id, tourist_id, buddy_id, last_message_at
   FROM public.conversations
   WHERE (tourist_id = $1 AND buddy_id = $2) OR (tourist_id = $2 AND buddy_id = $1)
   ORDER BY last_message_at DESC NULLS LAST`,
  [t.rows[0].id, b.rows[0].id],
)
console.log('john<->lan convs:', all.rows.length)
for (const r of all.rows) console.log(' ', r)
await c.end()
