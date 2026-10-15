#!/usr/bin/env node
/**
 * Delete test/automation accounts, keep every seed + real account.
 *
 * Safe to run repeatedly (idempotent).
 *
 * Deletes from auth.users LAST, because that is the only irreversible
 * step — public.* rows are protected by FK ON DELETE CASCADE from
 * profiles, so removing the auth row would wipe the profile anyway. We
 * do it explicitly so the ordering is visible.
 *
 * Run the dry-run first:  node scripts/preview-wipe-test-accounts.mjs
 */
import { Client } from 'pg'

/** Seed accounts from supabase/seed.sql + real registered demo accounts. */
const KEEP = [
  'aaaa1111-1111-1111-1111-111111111111', // John Doe       (buddy)
  '11111111-1111-1111-1111-111111111111', // Lan Pham       (buddy)
  '22222222-2222-2222-2222-222222222222', // Minh Nguyen    (buddy)
  '33333333-3333-3333-3333-333333333333', // Huy Nguyen     (buddy)
  '44444444-4444-4444-4444-444444444444', // Linh Tran      (buddy)
  '55555555-5555-5555-5555-555555555555', // Mai Le         (buddy)
  '66666666-6666-6666-6666-666666666666', // Tuan Vu        (buddy)
  'aaaa2222-2222-2222-2222-222222222222', // Sarah Miller   (tourist)
  'aaaa3333-3333-3333-3333-333333333333', // Mike Johnson   (tourist)
  'f2df98b0-96cf-451d-9d85-5060ddc1ca01', // Phan Nhật Toàn (tourist)
  '47643aa6-1ad0-4734-8c38-41b4de260f6d', // Tá Bảo         (tourist)
]

const DRY_RUN = process.argv.includes('--dry-run') || process.argv.includes('--preview')

const client = new Client({
  host: 'db.pqvnjgyqbxlylawwogjv.supabase.co',
  port: 5432,
  user: 'postgres',
  password: process.env.DB_PW || process.env.SUPABASE_DB_PASSWORD || 'that1arlecchino',
  database: 'postgres',
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 15000,
})

await client.connect()
try {
  const { rows: targets } = await client.query(
    `SELECT p.id, p.full_name, u.email
     FROM public.profiles p
     LEFT JOIN auth.users u ON u.id = p.id
     WHERE NOT (p.id::text = ANY($1::text[]))
     ORDER BY p.full_name`,
    [KEEP],
  )

  console.log(`\n${DRY_RUN ? 'DRY RUN' : 'LIVE RUN'} — ${targets.length} account(s) targeted`)
  for (const t of targets) console.log(`  - ${t.full_name}  <${t.email ?? 'no auth row'}>`)

  if (targets.length === 0) {
    console.log('\nNothing to do. Database is already clean.')
    process.exit(0)
  }

  const ids = targets.map((t) => t.id)

  if (DRY_RUN) {
    console.log('\nRe-run without --dry-run to actually delete.')
    process.exit(0)
  }

  await client.query('BEGIN')

  // 1. Conversations where the doomed user is on EITHER side. Deleting
  //    by tourist_id alone would miss rows where they are the buddy_id.
  await client.query(
    `DELETE FROM public.conversations
     WHERE tourist_id = ANY($1::uuid[]) OR buddy_id = ANY($1::uuid[])`,
    [ids],
  )
  // 2. Messages + reactions hang off conversations; clear any orphan.
  await client.query(
    `DELETE FROM public.message_reactions
     WHERE message_id IN (SELECT id FROM public.messages WHERE sender_id = ANY($1::uuid[]))`,
    [ids],
  )
  await client.query(`DELETE FROM public.messages WHERE sender_id = ANY($1::uuid[])`, [ids])
  await client.query(
    `DELETE FROM public.connections
     WHERE tourist_id = ANY($1::uuid[]) OR buddy_id = ANY($1::uuid[])`,
    [ids],
  )
  await client.query(
    `DELETE FROM public.reviews WHERE reviewer_id = ANY($1::uuid[]) OR reviewee_id = ANY($1::uuid[])`,
    [ids],
  )
  await client.query(`DELETE FROM public.location_updates WHERE user_id = ANY($1::uuid[])`, [ids])
  await client.query(
    `DELETE FROM public.swipes WHERE swiper_id = ANY($1::uuid[]) OR target_id = ANY($1::uuid[])`,
    [ids],
  )
  await client.query(
    `DELETE FROM public.notifications WHERE user_id = ANY($1::uuid[]) OR actor_id = ANY($1::uuid[])`,
    [ids],
  ).catch(() => console.log('  (notifications: skipped, schema differs)'))
  await client.query(
    `DELETE FROM public.pending_calls WHERE caller_id = ANY($1::uuid[]) OR callee_id = ANY($1::uuid[])`,
    [ids],
  ).catch(() => console.log('  (pending_calls: skipped, schema differs)'))
  await client.query(
    `DELETE FROM public.matches WHERE tourist_id = ANY($1::uuid[]) OR buddy_id = ANY($1::uuid[])`,
    [ids],
  ).catch(() => console.log('  (matches: skipped, schema differs)'))
  await client.query(`DELETE FROM public.tourists WHERE id = ANY($1::uuid[])`, [ids])
  await client.query(`DELETE FROM public.buddies WHERE id = ANY($1::uuid[])`, [ids])
  await client.query(`DELETE FROM public.profiles WHERE id = ANY($1::uuid[])`, [ids])

  // 4. auth last — irreversible.
  await client.query(`DELETE FROM auth.users WHERE id = ANY($1::uuid[])`, [ids])

  await client.query('COMMIT')
  console.log(`\nDeleted ${ids.length} account(s).`)
} catch (e) {
  await client.query('ROLLBACK').catch(() => {})
  console.error('\nFAILED — rolled back, nothing was deleted:\n', e.message)
  process.exitCode = 1
} finally {
  await client.end()
}