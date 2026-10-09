// scripts/diag-ensure-conv-v3.mjs
// Find tourist_id (John) and buddy_id (Lan) by joining profiles.
import { Client } from 'pg'
const c = new Client({
  connectionString:
    'postgresql://postgres:that1arlecchino@db.pqvnjgyqbxlylawwogjv.supabase.co:5432/postgres',
  ssl: { rejectUnauthorized: false },
})
await c.connect()
const john = 'aaaa1111-1111-1111-1111-111111111111'
const lan = '11111111-1111-1111-1111-111111111111'
// tourists/buddies use id = auth.users id (per schema in AGENTS.md)
const t = await c.query("SELECT id FROM public.tourists WHERE id = $1", [john])
const b = await c.query("SELECT id FROM public.buddies WHERE id = $1", [lan])
console.log('john.tourist row:', t.rows[0])
console.log('lan.buddy row:', b.rows[0])
if (!t.rows[0] || !b.rows[0]) {
  await c.end()
  process.exit(1)
}
const ins = await c.query(
  `INSERT INTO public.conversations (tourist_id, buddy_id) VALUES ($1, $2)
   ON CONFLICT DO NOTHING RETURNING id`,
  [john, lan],
)
console.log('inserted:', ins.rows)
const all = await c.query(
  `SELECT id, tourist_id, buddy_id, last_message_at
   FROM public.conversations
   WHERE (tourist_id = $1 AND buddy_id = $2) OR (tourist_id = $2 AND buddy_id = $1)
   ORDER BY last_message_at DESC NULLS LAST`,
  [john, lan],
)
console.log('john<->lan convs:', all.rows.length)
for (const r of all.rows) console.log(' ', r)
await c.end()
