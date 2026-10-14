#!/usr/bin/env node
/**
 * READ-ONLY audit of role consistency across the database.
 *
 * WHY (2026-10-10): /buddies/aaaa1111-1111-1111-1111-111111111111 404s.
 * That UUID is John Doe — a SEED TOURIST. Something renders him as a buddy
 * even though he has no `buddies` row. That is a role-mismatch bug, and it
 * is what makes some profiles unopenable.
 *
 * This script only SELECTs. It changes nothing. Run it before deciding
 * whether to normalize rows or wipe the database.
 */
import { Client } from 'pg'

const PW = process.env.DB_PW || process.env.SUPABASE_DB_PASSWORD || 'that1arlecchino'
const client = new Client({
  host: 'db.pqvnjgyqbxlylawwogjv.supabase.co',
  port: 5432,
  user: 'postgres',
  password: PW,
  database: 'postgres',
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 15000,
})

const q = async (label, sql) => {
  const { rows } = await client.query(sql)
  console.log(`\n### ${label}  (${rows.length} rows)`)
  console.table(rows)
  return rows
}

await client.connect()
try {
  console.log('=== 1. ROLE CONSISTENCY: profiles.role vs side tables ===')
  await q(
    'every profile with its actual side-table membership',
    `SELECT
       p.id,
       p.full_name,
       p.role                                       AS profiles_role,
       (b.id IS NOT NULL)                           AS has_buddies_row,
       (t.id IS NOT NULL)                           AS has_tourists_row,
       CASE
         WHEN p.role = 'buddy'   AND b.id IS NULL     THEN 'BROKEN: buddy w/o buddies row'
         WHEN p.role = 'tourist' AND t.id IS NULL     THEN 'BROKEN: tourist w/o tourists row'
         WHEN b.id IS NOT NULL AND t.id IS NOT NULL   THEN 'BROKEN: has BOTH rows'
         WHEN p.role = 'buddy'   AND t.id IS NOT NULL THEN 'BROKEN: role says buddy, row is tourist'
         WHEN p.role = 'tourist' AND b.id IS NOT NULL THEN 'BROKEN: role says tourist, row is buddy'
         ELSE 'ok'
       END                                           AS verdict
     FROM public.profiles p
     LEFT JOIN public.buddies   b ON b.id = p.id
     LEFT JOIN public.tourists  t ON t.id = p.id
     ORDER BY verdict DESC, p.full_name`,
  )

  console.log('\n=== 2. BROKEN ROWS ONLY (what actually needs fixing) ===')
  await q(
    'role mismatches',
    `SELECT
       p.id, p.full_name, p.role AS profiles_role,
       (b.id IS NOT NULL) AS has_buddies_row,
       (t.id IS NOT NULL) AS has_tourists_row
     FROM public.profiles p
     LEFT JOIN public.buddies  b ON b.id = p.id
     LEFT JOIN public.tourists t ON t.id = p.id
     WHERE (p.role='buddy'   AND b.id IS NULL AND t.id IS NULL)
        OR (p.role='tourist' AND t.id IS NULL AND b.id IS NULL)
        OR (b.id IS NOT NULL AND t.id IS NOT NULL)
        OR (p.role='buddy'   AND t.id IS NOT NULL)
        OR (p.role='tourist' AND b.id IS NOT NULL)
     ORDER BY p.full_name`,
  )

  console.log('\n=== 3. ORPHAN REFERENCES: rows pointing at a non-buddy as buddy_id ===')
  await q(
    'conversations whose buddy_id is not actually a buddy',
    `SELECT c.id, c.tourist_id, c.buddy_id,
            p2.role AS buddy_profiles_role,
            (b.id IS NOT NULL) AS buddy_has_row
     FROM public.conversations c
     JOIN public.profiles p2 ON p2.id = c.buddy_id
     LEFT JOIN public.buddies b ON b.id = c.buddy_id
     WHERE p2.role <> 'buddy' OR b.id IS NULL`,
  )

  await q(
    'connections whose buddy_id is not actually a buddy',
    `SELECT con.id, con.tourist_id, con.buddy_id, p2.role AS buddy_profiles_role,
            (b.id IS NOT NULL) AS buddy_has_row
     FROM public.connections con
     JOIN public.profiles p2 ON p2.id = con.buddy_id
     LEFT JOIN public.buddies b ON b.id = con.buddy_id
     WHERE p2.role <> 'buddy' OR b.id IS NULL`,
  )

  console.log('\n=== 4. INVENTORY: how much is there to wipe, if you choose that ===')
  await q(
    'row counts per table',
    `SELECT 'profiles' t, count(*) n FROM public.profiles
     UNION ALL SELECT 'tourists', count(*) FROM public.tourists
     UNION ALL SELECT 'buddies', count(*) FROM public.buddies
     UNION ALL SELECT 'connections', count(*) FROM public.connections
     UNION ALL SELECT 'conversations', count(*) FROM public.conversations
     UNION ALL SELECT 'messages', count(*) FROM public.messages
     UNION ALL SELECT 'trips', count(*) FROM public.trips
     UNION ALL SELECT 'trip_stops', count(*) FROM public.trip_stops
     UNION ALL SELECT 'reviews', count(*) FROM public.reviews
     UNION ALL SELECT 'location_updates', count(*) FROM public.location_updates
     UNION ALL SELECT 'message_reactions', count(*) FROM public.message_reactions
     UNION ALL SELECT 'auth.users', count(*) FROM auth.users
     ORDER BY n DESC, t`,
  )

  console.log('\n=== 5. AUTH USERS without a profiles row (orphans) ===')
  await q(
    'auth.users missing profiles',
    `SELECT u.id, u.email, u.created_at
     FROM auth.users u
     LEFT JOIN public.profiles p ON p.id = u.id
     WHERE p.id IS NULL
     ORDER BY u.created_at`,
  )
} catch (e) {
  console.error('AUDIT FAILED:', e.message)
} finally {
  await client.end()
}