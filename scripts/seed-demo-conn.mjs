import { Client } from 'pg'
const c = new Client({
  connectionString: 'postgresql://postgres:that1arlecchino@db.pqvnjgyqbxlylawwogjv.supabase.co:5432/postgres',
  ssl: { rejectUnauthorized: false },
})

async function main() {
  await c.connect()

  // Find IDs
  const tourist = await c.query("SELECT id FROM auth.users WHERE email = 'john.doe.tourist@gmail.com'")
  const buddy = await c.query("SELECT b.id, b.location_city, b.latitude, b.longitude FROM public.buddies b JOIN auth.users u ON u.id = b.id WHERE u.email = 'lan.pham.buddy@gmail.com'")
  const touristId = tourist.rows[0]?.id
  const buddyId = buddy.rows[0]?.id
  const buddyLat = buddy.rows[0]?.latitude
  const buddyLng = buddy.rows[0]?.longitude
  console.log('touristId:', touristId, 'buddyId:', buddyId, 'lat:', buddyLat, 'lng:', buddyLng)

  if (!touristId || !buddyId) {
    console.log('Missing demo users')
    process.exit(1)
  }

  // Upsert location for buddy
  await c.query(
    `INSERT INTO public.location_updates (user_id, latitude, longitude, accuracy, updated_at)
     VALUES ($1, $2, $3, 50, now())
     ON CONFLICT (user_id) DO UPDATE SET latitude = $2, longitude = $3, updated_at = now()`,
    [buddyId, buddyLat, buddyLng]
  )

  // Create an accepted connection if missing
  const existing = await c.query(
    `SELECT id FROM public.connections WHERE tourist_id = $1 AND buddy_id = $2`,
    [touristId, buddyId]
  )
  let connId = existing.rows[0]?.id
  if (!connId) {
    const r = await c.query(
      `INSERT INTO public.connections (tourist_id, buddy_id, status, message, created_at)
       VALUES ($1, $2, 'accepted', 'Demo connection from smoke test', now())
       RETURNING id`,
      [touristId, buddyId]
    )
    connId = r.rows[0].id
    console.log('Created connection:', connId)
  } else {
    await c.query(`UPDATE public.connections SET status = 'accepted' WHERE id = $1`, [connId])
    console.log('Existing connection:', connId, 'set to accepted')
  }

  // Create a planned trip
  const existingTrip = await c.query(
    `SELECT id FROM public.trips WHERE tourist_id = $1 AND buddy_id = $2 LIMIT 1`,
    [touristId, buddyId]
  )
  if (existingTrip.rows.length === 0) {
    const r = await c.query(
      `INSERT INTO public.trips (tourist_id, buddy_id, title, destination, start_date, end_date, status, created_at)
       VALUES ($1, $2, 'Khám phá Đà Nẵng', 'Da Nang', CURRENT_DATE, CURRENT_DATE + 3, 'confirmed', now())
       RETURNING id`,
      [touristId, buddyId]
    )
    console.log('Created trip:', r.rows[0].id)
  }

  await c.end()
  console.log('Done')
}
main().catch(console.error)
