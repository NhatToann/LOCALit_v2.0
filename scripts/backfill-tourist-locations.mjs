#!/usr/bin/env node
/**
 * Backfill location_city / latitude / longitude for any tourist
 * who has a recent location_updates row but the static tourist row
 * is still missing the lat/lng. Picks the most recent update per
 * user and writes its city / coords to the static row so they show
 * up on /browse's static map + recommend list.
 */
import { Client } from 'pg'

const pw = process.env.DB_PW || process.env.SUPABASE_DB_PASSWORD
const pg = new Client({ host: 'db.pqvnjgyqbxlylawwogjv.supabase.co', port: 5432, user: 'postgres', password: pw, database: 'postgres', ssl: { rejectUnauthorized: false } })
await pg.connect()

const r = await pg.query(`
  WITH latest AS (
    SELECT DISTINCT ON (user_id)
      user_id, latitude, longitude, updated_at
    FROM public.location_updates
    ORDER BY user_id, updated_at DESC
  )
  UPDATE public.tourists t
     SET latitude = l.latitude,
         longitude = l.longitude,
         location_city = COALESCE(t.location_city, 'Da Nang')
    FROM latest l
   WHERE t.id = l.user_id
     AND t.latitude IS NULL
  RETURNING t.id, t.location_city, t.latitude, t.longitude
`)
console.log(`[backfill] ${r.rows.length} tourist row(s) backfilled from location_updates:`)
console.table(r.rows)

// Also for any tourist with destination=Da Nang, fill in the
// default Da Nang coords as a safety net.
const r2 = await pg.query(`
  UPDATE public.tourists
     SET latitude = COALESCE(latitude, 16.0544),
         longitude = COALESCE(longitude, 108.2023),
         location_city = COALESCE(location_city, 'Da Nang')
   WHERE destination = 'Da Nang'
     AND latitude IS NULL
  RETURNING id, location_city, latitude, longitude
`)
console.log(`[backfill] ${r2.rows.length} additional Da Nang tourist row(s) from destination:`)
console.table(r2.rows)

await pg.end()
