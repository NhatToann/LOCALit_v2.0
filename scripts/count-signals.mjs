import pg from 'pg'

const c = new pg.Client({
  connectionString:
    'postgresql://postgres:that1arlecchino@db.pqvnjgyqbxlylawwogjv.supabase.co:5432/postgres',
  ssl: { rejectUnauthorized: false },
})
await c.connect()
const { rows } = await c.query(
  'SELECT count(*) FROM public.webrtc_signals WHERE to_user_id = $1',
  ['11111111-1111-1111-1111-111111111111'],
)
console.log('rows to buddy:', rows[0].count)
await c.end()
