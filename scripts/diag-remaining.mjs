import { Client } from 'pg'
const c = new Client({ connectionString: 'postgresql://postgres:that1arlecchino@db.pqvnjgyqbxlylawwogjv.supabase.co:5432/postgres', ssl: { rejectUnauthorized: false } })
await c.connect()

// Check schema for remaining rows
const tables = [
  'reviews', 'itineraries', 'conversations', 'messages', 'notifications',
  'pending_calls', 'connections', 'email_verifications', 'location_updates',
]
for (const t of tables) {
  const { rows: cols } = await c.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = $1
    ORDER BY ordinal_position
  `, [t])
  const { rows: sample } = await c.query(`SELECT * FROM public.${t} LIMIT 1`)
  console.log(`[${t}]  ${cols.map(c => c.column_name).join(', ')}`)
  if (sample.length > 0) {
    const keys = Object.keys(sample[0])
    console.log(`        sample: ${keys.slice(0, 8).map(k => `${k}=${String(sample[0][k]).slice(0,30)}`).join(' | ')}`)
  }
}
await c.end()
