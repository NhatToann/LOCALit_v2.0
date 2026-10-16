// cleanup-duplicate-connection-notifications.mjs
//
// One-shot idempotent cleanup for the 2x-notification bug.
//
// Background (2026-10-16): the connection API routes were calling
// public.insert_notification() after every INSERT/UPDATE on
// public.connections, on top of the DB trigger
// public.notify_on_connection(). Every connection event therefore
// produced 2 notification rows. After deploying the fix
// (removing the manual RPC calls + dropping the RPC + dropping the
// orphan INSERT policy), existing duplicate rows in the
// notifications table need to be cleaned up so the bell doesn't keep
// showing ghost unread counts.
//
// Algorithm: keep the OLDEST row per (user_id, type, actor_id,
// created_at-bucketed-to-1-minute) group; delete the rest. We bucket
// by 1 minute because the trigger and the API RPC for the same
// event fire within milliseconds of each other, but real distinct
// events (request + accept) are usually seconds apart.
//
// The script is idempotent: re-running it is a no-op once duplicates
// are removed.
//
// Usage:
//   $env:DB_PW = "that1arlecchino"
//   node scripts/cleanup-duplicate-connection-notifications.mjs [--dry-run]

import { Client } from 'pg'

const DRY_RUN = process.argv.includes('--dry-run')

const c = new Client({
  connectionString:
    'postgresql://postgres:that1arlecchino@db.pqvnjgyqbxlylawwogjv.supabase.co:5432/postgres',
  ssl: { rejectUnauthorized: false },
})

await c.connect()

try {
  console.log(`[cleanup] mode=${DRY_RUN ? 'dry-run' : 'apply'}`)

  // 1) Identify duplicates
  const dups = await c.query(`
    WITH grouped AS (
      SELECT
        id,
        user_id,
        type,
        actor_id,
        date_trunc('minute', created_at) AS bucket,
        created_at,
        ROW_NUMBER() OVER (
          PARTITION BY user_id, type, actor_id, date_trunc('minute', created_at)
          ORDER BY created_at ASC, id ASC
        ) AS rn,
        COUNT(*) OVER (
          PARTITION BY user_id, type, actor_id, date_trunc('minute', created_at)
        ) AS group_size
      FROM public.notifications
      WHERE type IN ('connection_request', 'connection_accepted', 'connection_declined')
    )
    SELECT id, user_id, type, actor_id, bucket, group_size
    FROM grouped
    WHERE rn > 1
    ORDER BY bucket DESC
  `)

  console.log(`[cleanup] found ${dups.rows.length} duplicate rows to delete`)

  if (dups.rows.length === 0) {
    console.log('[cleanup] nothing to do. Exiting.')
  } else {
    const byType = dups.rows.reduce((acc, r) => {
      acc[r.type] = (acc[r.type] ?? 0) + 1
      return acc
    }, {})
    console.log('[cleanup] breakdown by type:', byType)

    if (!DRY_RUN) {
      const ids = dups.rows.map((r) => r.id)
      const del = await c.query(
        'DELETE FROM public.notifications WHERE id = ANY($1::uuid[]) RETURNING id, type, user_id',
        [ids],
      )
      console.log(`[cleanup] deleted ${del.rows.length} rows`)
    } else {
      console.log('[cleanup] dry-run — no rows deleted')
    }
  }

  // 2) Verify the per-event count is now exactly 1
  const verify = await c.query(`
    SELECT type, COUNT(*)::int AS n
    FROM public.notifications
    WHERE type LIKE 'connection_%'
    GROUP BY type
    ORDER BY type
  `)
  console.log('\n[verify] post-cleanup count by type:')
  console.table(verify.rows)
} catch (e) {
  console.error('[cleanup] error:', e.message)
  console.error(e.stack)
  process.exitCode = 1
} finally {
  await c.end()
}
