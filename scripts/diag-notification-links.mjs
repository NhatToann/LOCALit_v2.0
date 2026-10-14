#!/usr/bin/env node
/**
 * Why can't the user tap "View and respond" on a buddy-request
 * notification?
 *
 * NotificationBell.markRead() does:
 *     if (link) router.push(link)
 * so a notification with `link = NULL` is silently a no-op — the popover
 * closes and nothing happens. That matches the reported symptom exactly.
 *
 * Checks:
 *   1. what `link` values are actually stored
 *   2. whether they point at routes that still exist after the
 *      /tourist/* and /buddy/* retirement
 *   3. whether the migration that creates notifications sets `link`
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
  console.log('=== 1. notifications table columns ===')
  const { rows: cols } = await client.query(
    `SELECT column_name, data_type, is_nullable, column_default
     FROM information_schema.columns
     WHERE table_schema='public' AND table_name='notifications'
     ORDER BY ordinal_position`,
  )
  console.table(cols)

  console.log('\n=== 2. stored notifications + their link ===')
  await show(
    'notifications',
    `SELECT n.id, n.user_id, p.full_name AS recipient, n.type,
            n.title, n.link, n.read_at IS NOT NULL AS is_read, n.created_at
     FROM public.notifications n
     LEFT JOIN public.profiles p ON p.id = n.user_id
     ORDER BY n.created_at DESC
     LIMIT 25`,
  )

  console.log('\n=== 3. THE SMOKING GUN: notifications with a NULL or stale link ===')
  await show(
    'broken links',
    `SELECT id, type, title, link,
            CASE
              WHEN link IS NULL OR link = '' THEN 'NULL link -> router.push never runs'
              WHEN link LIKE '/tourist/%' THEN 'DEAD: /tourist/* retired 2026-10-01'
              WHEN link LIKE '/buddy/%'  THEN 'DEAD: /buddy/* retired 2026-10-01'
              WHEN link NOT LIKE '/%'   THEN 'NOT a path: ' || link
              ELSE 'ok'
            END AS verdict
     FROM public.notifications
     WHERE link IS NULL OR link = ''
        OR link LIKE '/tourist/%' OR link LIKE '/buddy/%' OR link NOT LIKE '/%'
     ORDER BY created_at DESC`,
  )

  console.log('\n=== 4. link values grouped (what patterns exist) ===')
  await show(
    'link patterns',
    `SELECT
       COALESCE(link, '(null)') AS link,
       type,
       count(*)::int AS n,
       min(created_at) AS oldest,
       max(created_at) AS newest
     FROM public.notifications
     GROUP BY link, type
     ORDER BY n DESC, newest DESC`,
  )

  console.log('\n=== 5. who creates notifications, and does it set link? ===')
  const { rows: ins } = await client.query(
    `SELECT p.proname, pg_get_function_arguments(p.oid) AS args
     FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname='public'
       AND (p.proname ILIKE '%notif%' OR p.proname ILIKE '%request%' OR p.proname ILIKE '%connect%')
     ORDER BY p.proname`,
  )
  if (ins.length) console.table(ins)
  else console.log('  (no helper functions found — inserts are inline in app code)')

  await show(
    'RLS on notifications',
    `SELECT policyname, roles::text, cmd,
            CASE WHEN qual IS NULL THEN '(no filter)' ELSE 'filtered' END AS using_clause
     FROM pg_policies
     WHERE schemaname='public' AND tablename='notifications'`,
  )
} catch (e) {
  console.error('FAILED:', e.message)
} finally {
  await client.end()
}