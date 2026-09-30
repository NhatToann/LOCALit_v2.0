import pkg from 'pg'
const { Client } = pkg
const c = new Client({
  connectionString:
    'postgresql://postgres:that1arlecchino@db.pqvnjgyqbxlylawwogjv.supabase.co:5432/postgres',
  ssl: { rejectUnauthorized: false },
})
c.connect().then(async () => {
  const r = await c.query(
    "SELECT id, kind, payload, payload::text as payload_text FROM webrtc_signals WHERE kind = 'offer' ORDER BY created_at DESC LIMIT 1"
  )
  console.log(JSON.stringify(r.rows[0], null, 2))
  await c.end()
})
