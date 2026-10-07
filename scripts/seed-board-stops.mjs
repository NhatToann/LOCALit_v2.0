// scripts/seed-board-stops.mjs
// Seeds 6 stops on the existing test itinerary so the Trello board
// has visible cards to drag in browser tests.
import { Client } from 'pg'
const c = new Client({
  host: 'db.pqvnjgyqbxlylawwogjv.supabase.co',
  port: 5432,
  user: 'postgres',
  password: process.env.DB_PW,
  database: 'postgres',
  ssl: { rejectUnauthorized: false },
})
const STOPS = [
  { name: 'Bánh mì Madam Khanh', time: '08:00', cat: 'food', dur: 30, cost: 25000 },
  { name: 'Marble Mountains', time: '09:30', cat: 'sight', dur: 120, cost: 40000 },
  { name: 'Lunch at Mì Quảng ếch', time: '12:30', cat: 'food', dur: 60, cost: 60000 },
  { name: 'Han Market', time: '15:00', cat: 'sight', dur: 90, cost: 0 },
  { name: 'Dragon Bridge (weekend show)', time: '20:30', cat: 'activity', dur: 30, cost: 0 },
  { name: 'Son Tra night viewpoint', time: '21:30', cat: 'sight', dur: 60, cost: 0 },
]
;(async () => {
  await c.connect()
  const itin = await c.query(`SELECT id FROM itineraries ORDER BY created_at DESC LIMIT 1`)
  const itinId = itin.rows[0].id
  const day = await c.query(`SELECT id FROM itinerary_days WHERE itinerary_id=$1 LIMIT 1`, [itinId])
  const dayId = day.rows[0].id

  // Wipe any existing stops for a clean board
  await c.query(`DELETE FROM itinerary_stops WHERE day_id=$1`, [dayId])

  for (let i = 0; i < STOPS.length; i++) {
    const s = STOPS[i]
    await c.query(
      `INSERT INTO itinerary_stops (itinerary_id, day_id, stop_order, name, planned_time, category, duration_minutes, est_cost_cents, address)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [itinId, dayId, i, s.name, s.time, s.cat, s.dur, s.cost, 'Da Nang, Vietnam'],
    )
  }
  const cnt = await c.query(`SELECT COUNT(*) AS n FROM itinerary_stops WHERE day_id=$1`, [dayId])
  console.log(`Seeded ${cnt.rows[0].n} stops on itinerary ${itinId}, day ${dayId}`)
  console.log('Open /itinerary/' + itinId + ' to drag stops around')
  await c.end()
})()