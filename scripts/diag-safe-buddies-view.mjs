#!/usr/bin/env node
/**
 * Why does /buddies/aaaa1111-... 404 when the `buddies` row exists?
 *
 * The page reads the `safe_buddies` VIEW, not the table. A view can
 * silently drop rows via its WHERE clause (is_available, is_visible,
 * a rounded-coordinate filter) — leaving `maybeSingle()` null and the
 * route calling notFound(). Same table, different visibility.
 *
 * READ-ONLY.
 */
import { Client } from 'pg'

const client = new Client({
  host: 'db.pqvnjgyqbxlylawwogjv.supabase.co',
  port: 5432,
  user: 'postgres',
  password: process.env.DB_PW || process.env.SUPABASE_DB_PASSWORD || 'that1arlecchino',
  database: 'postgres',
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 15000,
})

const JOHN = 'aaaa1111-1111-1111-1111-111111111111'

const show = async (label, sql) => {
  const { rows } = await client.query(sql)
  console.log(`\n### ${label} (${rows.length} rows)`)
  console.table(rows)
}

await client.connect()
try {
  console.log('=== A. The raw buddies row for John Doe ===')
  await show(
    'buddies table row',
    `SELECT id, location_city, latitude, longitude, hourly_rate,
            is_available, bio, rating_avg, trips_completed
     FROM public.buddies WHERE id = '${JOHN}'`,
  )

  console.log('\n=== B. Does safe_buddies expose him? ===')
  await show(
    'safe_buddies row (what the page actually reads)',
    `SELECT id, location_city, latitude, longitude, hourly_rate, is_available
     FROM public.safe_buddies WHERE id = '${JOHN}'`,
  )

  console.log('\n=== C. The view definition (the WHERE clause is the suspect) ===')
  const { rows: def } = await client.query(
    `SELECT pg_get_viewdef('public.safe_buddies'::regclass, true) AS sql`,
  )
  console.log(def[0]?.sql ?? '(could not read view definition)')

  console.log('\n=== D. Which buddies rows the view DROPS, and why ===')
  await show(
    'buddies rows missing from safe_buddies',
    `SELECT b.id, p.full_name, b.is_available, b.location_city,
            b.latitude, b.longitude,
            CASE
              WHEN NOT b.is_available            THEN 'dropped: is_available=false'
              WHEN b.latitude IS NULL            THEN 'dropped: NULL latitude'
              WHEN b.longitude IS NULL           THEN 'dropped: NULL longitude'
              ELSE 'dropped: view filter (see definition)'
            END AS reason
     FROM public.buddies b
     JOIN public.profiles p ON p.id = b.id
     WHERE NOT EXISTS (SELECT 1 FROM public.safe_buddies s WHERE s.id = b.id)
     ORDER BY p.full_name`,
  )

  console.log('\n=== E. Every table that exists (inventory — trips name differs) ===')
  await show(
    'public tables',
    `SELECT tablename FROM pg_tables
     WHERE schemaname='public' ORDER BY tablename`,
  )
} catch (e) {
  console.error('FAILED:', e.message)
} finally {
  await client.end()
}