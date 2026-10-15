#!/usr/bin/env node
/**
 * Post-wipe cleanup + verification.
 *
 * 1. Deletes conversations whose `buddy_id` / `tourist_id` does not match
 *    the account's actual role. These are leftovers from old tests where a
 *    test account had its role flipped, producing a chat row that points
 *    at a "buddy" who is really a tourist. They make /chat render nonsense.
 * 2. Prints a final consistency report.
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

const show = async (label, sql, params = []) => {
  const { rows } = await client.query(sql, params)
  console.log(`\n### ${label} (${rows.length})`)
  console.table(rows)
  return rows
}

await client.connect()
try {
  console.log('=== 1. role-mismatched conversations BEFORE cleanup ===')
  await show(
    'conversations with wrong role on either side',
    `SELECT c.id, c.tourist_id, pt.role AS tourist_role, c.buddy_id, pb.role AS buddy_role
     FROM public.conversations c
     JOIN public.profiles pt ON pt.id = c.tourist_id
     JOIN public.profiles pb ON pb.id = c.buddy_id
     WHERE pt.role <> 'tourist' OR pb.role <> 'buddy'`,
  )

  const del = await client.query(
    `DELETE FROM public.conversations c
     USING public.profiles pt, public.profiles pb
     WHERE c.tourist_id = pt.id AND c.buddy_id = pb.id
       AND (pt.role <> 'tourist' OR pb.role <> 'buddy')
     RETURNING c.id`,
  )
  console.log(`\n  -> deleted ${del.rowCount} role-mismatched conversation(s)`)

  console.log('\n=== 2. FINAL STATE ===')
  await show(
    'profiles',
    `SELECT p.full_name, p.role,
            (b.id IS NOT NULL) AS has_buddies_row,
            (t.id IS NOT NULL) AS has_tourists_row,
            CASE WHEN b.id IS NOT NULL AND t.id IS NOT NULL THEN 'BROKEN'
                 WHEN p.role='buddy'   AND b.id IS NULL     THEN 'BROKEN'
                 WHEN p.role='tourist' AND t.id IS NULL     THEN 'BROKEN'
                 ELSE 'ok' END AS verdict
     FROM public.profiles p
     LEFT JOIN public.buddies  b ON b.id = p.id
     LEFT JOIN public.tourists t ON t.id = p.id
     ORDER BY p.role, p.full_name`,
  )

  console.log('\n=== 3. buddies still missing GPS (will render without a map pin) ===')
  await show(
    'buddies without coordinates',
    `SELECT b.id, p.full_name, b.location_city, b.latitude, b.longitude
     FROM public.buddies b JOIN public.profiles p ON p.id = b.id
     WHERE b.latitude IS NULL OR b.longitude IS NULL
     ORDER BY p.full_name`,
  )

  await show(
    'row counts',
    `SELECT 'profiles' t, count(*) n FROM public.profiles
     UNION ALL SELECT 'tourists', count(*) FROM public.tourists
     UNION ALL SELECT 'buddies', count(*) FROM public.buddies
     UNION ALL SELECT 'conversations', count(*) FROM public.conversations
     UNION ALL SELECT 'messages', count(*) FROM public.messages
     UNION ALL SELECT 'connections', count(*) FROM public.connections
     UNION ALL SELECT 'location_updates', count(*) FROM public.location_updates
     UNION ALL SELECT 'auth.users', count(*) FROM auth.users
     ORDER BY n DESC`,
  )
} catch (e) {
  console.error('FAILED:', e.message)
} finally {
  await client.end()
}