import { Client } from 'pg'
const c = new Client({ connectionString: 'postgresql://postgres:that1arlecchino@db.pqvnjgyqbxlylawwogjv.supabase.co:5432/postgres', ssl: { rejectUnauthorized: false } })
await c.connect()

const tables = [
  'matches',
  'pending_calls',
  'notifications',
  'itineraries',
  'itinerary_share',
  'itinerary_collaborators',
  'itinerary_bookmarks',
  'focus_requests',
  'focus_sessions',
  'message_reactions',
  'messages',
  'conversations',
  'connections',
]

for (const t of tables) {
  try {
    const { rows } = await c.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1
      ORDER BY ordinal_position
    `, [t])
    if (rows.length === 0) {
      console.log(`[${t}]  -- table does not exist --`)
      continue
    }
    const cols = rows.map(r => `${r.column_name}:${r.data_type}`).join(', ')
    console.log(`[${t}]  ${cols}`)
  } catch (e) {
    console.log(`[${t}]  ERROR: ${e.message}`)
  }
}

await c.end()
