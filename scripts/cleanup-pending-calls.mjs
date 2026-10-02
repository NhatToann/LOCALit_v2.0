import { Client } from 'pg'

const client = new Client({
  connectionString: `postgresql://postgres:that1arlecchino@db.pqvnjgyqbxlylawwogjv.supabase.co:5432/postgres`,
  ssl: { rejectUnauthorized: false },
})
await client.connect()

// Cleanup
const { rowCount: deletedRows } = await client.query(
  `DELETE FROM pending_calls WHERE callee_id='11111111-1111-1111-1111-111111111111'`,
)
console.log(`Deleted ${deletedRows} stale pending_calls`)
await client.end()