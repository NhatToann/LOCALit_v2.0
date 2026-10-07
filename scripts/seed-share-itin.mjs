// scripts/_share-itin.mjs
// Helper: add John as an editor on Lan's seeded itinerary so the
// 2-user realtime E2E (scripts/playwright-board-2user.mjs) can use
// both accounts without the invite flow.
import { Client } from 'pg'
const c = new Client({
  host: 'db.pqvnjgyqbxlylawwogjv.supabase.co',
  port: 5432,
  user: 'postgres',
  password: process.env.DB_PW,
  database: 'postgres',
  ssl: { rejectUnauthorized: false },
})
;(async () => {
  await c.connect()
  const john = await c.query("SELECT id FROM profiles WHERE email='john.doe@example.com'")
  const itin = await c.query("SELECT id, owner_id FROM itineraries ORDER BY created_at DESC LIMIT 1")
  if (john.rows.length === 0) { console.log('no john'); process.exit(1) }
  if (itin.rows.length === 0) { console.log('no itin'); process.exit(1) }
  const userId = john.rows[0].id
  const { id: itinId, owner_id: ownerId } = itin.rows[0]
  // Upsert a collaborator row
  await c.query(`
    INSERT INTO itinerary_collaborators (itinerary_id, user_id, role, status, invited_by)
    VALUES ($1, $2, 'editor', 'accepted', $3)
    ON CONFLICT (itinerary_id, user_id) DO UPDATE
    SET status='accepted', role='editor', invited_by=EXCLUDED.invited_by
  `, [itinId, userId, ownerId])
  console.log('OK — john is editor on', itinId)
  await c.end()
})()