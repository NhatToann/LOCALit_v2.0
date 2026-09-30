import pkg from 'pg'
const { Client } = pkg
const c = new Client({
  connectionString:
    'postgresql://postgres:that1arlecchino@db.pqvnjgyqbxlylawwogjv.supabase.co:5432/postgres',
  ssl: { rejectUnauthorized: false },
})
c.connect().then(async () => {
  const r1 = await c.query(
    "SELECT count(*), min(created_at), max(created_at) FROM webrtc_signals WHERE to_user_id = '11111111-1111-1111-1111-111111111111'"
  )
  console.log('buddy rows:', r1.rows)
  const r2 = await c.query(
    "SELECT id, call_id, kind, created_at FROM webrtc_signals WHERE to_user_id = '11111111-1111-1111-1111-111111111111' ORDER BY created_at DESC LIMIT 5"
  )
  console.log('latest 5:', r2.rows)
  await c.end()
})
