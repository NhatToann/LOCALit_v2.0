#!/usr/bin/env node
/**
 * DRY-RUN: preview exactly which rows a test-account wipe would delete.
 *
 * Deletes NOTHING. Prints the blast radius so the decision can be made
 * with real numbers instead of a guess.
 *
 * Protected (never deleted): the 6 seed accounts from supabase/seed.sql +
 * any account a real human registered (Sarah Miller, Phan Nhật Toàn,
 * Tá Bảo — the three the user actually uses in demos).
 */
import { Client } from 'pg'

const KEEP = new Set([
  // seed accounts
  'aaaa1111-1111-1111-1111-111111111111', // John Doe    (buddy, seed)
  '11111111-1111-1111-1111-111111111111', // Lan Pham    (buddy, seed)
  '22222222-2222-2222-2222-222222222222', // Minh Nguyen (buddy, seed)
  '33333333-3333-3333-3333-333333333333', // Huy Nguyen  (buddy, seed)
  '44444444-4444-4444-4444-444444444444', // Linh Tran   (buddy, seed)
  '55555555-5555-5555-5555-555555555555', // Mai Le      (buddy, seed)
  '66666666-6666-6666-6666-666666666666', // Tuan Vu     (buddy, seed)
  'aaaa2222-2222-2222-2222-222222222222', // Sarah Miller (tourist, seed)
  'aaaa3333-3333-3333-3333-333333333333', // Mike Johnson (tourist, seed)
  // real registered humans used in demos
  'f2df98b0-96cf-451d-9d85-5060ddc1ca01', // Phan Nhật Toàn
  '47643aa6-1ad0-4734-8c38-41b4de260f6d', // Tá Bảo
])

const client = new Client({
  host: 'db.pqvnjgyqbxlylawwogjv.supabase.co',
  port: 5432,
  user: 'postgres',
  password: process.env.DB_PW || process.env.SUPABASE_DB_PASSWORD || 'that1arlecchino',
  database: 'postgres',
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 15000,
})

const q = async (label, sql, params = []) => {
  const { rows } = await client.query(sql, params)
  console.log(`\n### ${label} (${rows.length})`)
  console.table(rows)
  return rows
}

await client.connect()
try {
  const doomedRows = await q(
    'accounts that WOULD be deleted',
    `SELECT id, full_name, role FROM public.profiles
     WHERE NOT (id::text = ANY($1::text[]))
     ORDER BY full_name`,
    [[...KEEP]],
  )

  console.log('=============================================')
  console.log(' DRY RUN — nothing will be deleted by this script')
  console.log('=============================================')

  console.log(`\nKEEP: ${KEEP.size} accounts`)
  console.log(`WIPE: ${doomedRows.length} accounts`)

  console.log('\n### dependent rows that WOULD be deleted')
  const doomedIds = doomedRows.map((r) => r.id)
  for (const [t, col] of [
    ['tourists', 'id'],
    ['buddies', 'id'],
    ['connections', 'tourist_id'],
    ['conversations', 'tourist_id'],
    ['messages', 'sender_id'],
    ['reviews', 'reviewer_id'],
    ['location_updates', 'user_id'],
    ['swipes', 'swiper_id'],
    ['notifications', 'user_id'],
    ['pending_calls', 'caller_id'],
  ]) {
    const { rows } = await client
      .query(
        `SELECT count(*)::int AS n FROM public.${t} WHERE ${col} = ANY($1::uuid[])`,
        [doomedIds],
      )
      .catch(() => ({ rows: [{ n: 'n/a' }] }))
    console.log(`  ${t.padEnd(20)} (${col})`.padEnd(34) + rows[0]?.n)
  }

  console.log('\n### auth.users that would be deleted')
  const { rows: authDoomed } = await client.query(
    `SELECT u.id, u.email, COALESCE(p.full_name,'(no profile)') AS full_name
     FROM auth.users u LEFT JOIN public.profiles p ON p.id = u.id
     WHERE NOT (u.id::text = ANY($1::text[]))
     ORDER BY u.email`,
    [[...KEEP]],
  )
  console.table(authDoomed)
} catch (e) {
  console.error('FAILED:', e.message)
} finally {
  await client.end()
}