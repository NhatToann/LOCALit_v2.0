// scripts/smoke-bucket.mjs
// Smoke test for itinerary_stops.day_bucket_override column.
// Runs as: node scripts/smoke-bucket.mjs
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

  // 1. Column exists with the right shape
  const col = await c.query(`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_schema='public' AND table_name='itinerary_stops' AND column_name='day_bucket_override'
  `)
  console.log('1. column:', col.rows[0])

  // 2. Index exists
  const idx = await c.query(`
    SELECT indexname FROM pg_indexes
    WHERE schemaname='public' AND tablename='itinerary_stops' AND indexname='idx_itinerary_stops_day_bucket_pos'
  `)
  console.log('2. index:', idx.rows[0]?.indexname ?? 'MISSING')

  // 3. Insert/update/delete with override works
  const itin = await c.query(`SELECT id FROM itineraries ORDER BY created_at DESC LIMIT 1`)
  if (itin.rows.length === 0) {
    console.log('3. SKIP: no itineraries to test on')
  } else {
    const itinId = itin.rows[0].id
    // pick or create a day
    const day = await c.query(`SELECT id FROM itinerary_days WHERE itinerary_id=$1 LIMIT 1`, [itinId])
    let dayId
    if (day.rows.length > 0) {
      dayId = day.rows[0].id
    } else {
      const d = await c.query(
        `INSERT INTO itinerary_days (itinerary_id, day_order, title) VALUES ($1, 1, 'smoke-day') RETURNING id`,
        [itinId],
      )
      dayId = d.rows[0].id
    }

    const stop = await c.query(
      `INSERT INTO itinerary_stops (itinerary_id, day_id, name, stop_order)
       VALUES ($1, $2, 'smoke-stop', 0) RETURNING id`,
      [itinId, dayId],
    )
    const stopId = stop.rows[0].id
    console.log('3. inserted stop:', stopId)

    // update override
    const u1 = await c.query(
      `UPDATE itinerary_stops SET day_bucket_override='afternoon' WHERE id=$1 RETURNING day_bucket_override`,
      [stopId],
    )
    console.log('   update → afternoon:', u1.rows[0])

    // update to invalid value should fail (CHECK constraint)
    try {
      await c.query(`UPDATE itinerary_stops SET day_bucket_override='noon' WHERE id=$1`, [stopId])
      console.log('   ❌ CHECK constraint did not fire')
    } catch (e) {
      console.log('   ✅ CHECK rejected invalid value:', e.message.split('\n')[0])
    }

    // null override back
    const u2 = await c.query(
      `UPDATE itinerary_stops SET day_bucket_override=NULL WHERE id=$1 RETURNING day_bucket_override`,
      [stopId],
    )
    console.log('   update → null:', u2.rows[0])

    // cleanup
    await c.query(`DELETE FROM itinerary_stops WHERE id=$1`, [stopId])
    console.log('   cleaned up')
  }

  await c.end()
  console.log('OK')
})().catch((e) => {
  console.error('FAIL', e.message)
  process.exit(1)
})