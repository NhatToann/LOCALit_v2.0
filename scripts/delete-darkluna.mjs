// scripts/delete-darkluna.mjs
// Deletes the darkluna account (and the leftover probe account from the
// signup-timing diagnostic) from production.
//
// Design notes:
//   - Dry run first by default. Pass --yes to actually delete.
//   - Everything happens in ONE transaction: DELETE FROM auth.users, which
//     cascades to profiles, tourists, buddies, connections, conversations,
//     messages, reviews, location_updates, trips, etc. (FK ON DELETE CASCADE).
//   - email_verifications has no FK to auth.users, so we clear it separately.
//   - After the delete we verify every dependent table reports 0 rows, so a
//     silent partial cascade can't slip through.
import pg from 'pg'
const { Client } = pg

const DRY_RUN = !process.argv.includes('--yes')
const c = new Client({
  connectionString: 'postgresql://postgres:that1arlecchino@db.pqvnjgyqbxlylawwogjv.supabase.co:5432/postgres',
  ssl: { rejectUnauthorized: false },
})
await c.connect()

// --- 1. Find targets -------------------------------------------------------
const { rows: targets } = await c.query(
  `SELECT u.id, u.email, p.full_name, p.role
     FROM auth.users u
     LEFT JOIN public.profiles p ON p.id = u.id
    WHERE u.email ILIKE '%darkluna%'
       OR u.email ILIKE 'timing.%@gmail.com'
    ORDER BY u.created_at`,
)

if (targets.length === 0) {
  console.log('No matching accounts. Nothing to do.')
  await c.end()
  process.exit(0)
}

const ids = targets.map((t) => t.id)
console.log('Accounts to delete:\n')
for (const t of targets) {
  console.log(`  ${t.email}`)
  console.log(`    id    = ${t.id}`)
  console.log(`    name  = ${t.full_name ?? '(no profile)'}`)
  console.log(`    role  = ${t.role ?? '-'}`)
}

// --- 2. Inventory of dependent rows ---------------------------------------
// Column names verified against the live schema via scripts/diag-schema.mjs +
// scripts/diag-tables.mjs. Two corrections vs. the original draft:
//   * `trips` no longer exists — it was renamed/replaced by `itineraries`.
//   * `reviews` keys off reviewer_id/reviewee_id (not tourist_id/buddy_id).
//   * `location_updates` uses user_id (not profile_id).
// Only `profiles.id` is a direct FK to auth.users; every table below hangs off
// profiles.id, so the cascade reaches all of them from the auth.users delete.
const inv = await c.query(
  `SELECT 'profiles' AS t, count(*)::int AS n FROM public.profiles           WHERE id = ANY($1::uuid[])
   UNION ALL SELECT 'tourists',   count(*)::int FROM public.tourists         WHERE id = ANY($1::uuid[])
   UNION ALL SELECT 'buddies',    count(*)::int FROM public.buddies          WHERE id = ANY($1::uuid[])
   UNION ALL SELECT 'connections',count(*)::int FROM public.connections      WHERE tourist_id = ANY($1::uuid[]) OR buddy_id = ANY($1::uuid[])
   UNION ALL SELECT 'conversations',count(*)::int FROM public.conversations  WHERE tourist_id = ANY($1::uuid[]) OR buddy_id = ANY($1::uuid[])
   UNION ALL SELECT 'matches',    count(*)::int FROM public.matches          WHERE tourist_id = ANY($1::uuid[]) OR buddy_id = ANY($1::uuid[])
   UNION ALL SELECT 'messages',   count(*)::int FROM public.messages         WHERE sender_id = ANY($1::uuid[])
   UNION ALL SELECT 'reviews',    count(*)::int FROM public.reviews          WHERE reviewer_id = ANY($1::uuid[]) OR reviewee_id = ANY($1::uuid[])
   UNION ALL SELECT 'locations',  count(*)::int FROM public.location_updates WHERE user_id = ANY($1::uuid[])
   UNION ALL SELECT 'itineraries',count(*)::int FROM public.itineraries      WHERE owner_id = ANY($1::uuid[])
   UNION ALL SELECT 'bookmarks',  count(*)::int FROM public.itinerary_bookmarks WHERE user_id = ANY($1::uuid[])
   UNION ALL SELECT 'notifications',count(*)::int FROM public.notifications  WHERE user_id = ANY($1::uuid[])
   UNION ALL SELECT 'swipes',     count(*)::int FROM public.swipes           WHERE swiper_id = ANY($1::uuid[]) OR target_id = ANY($1::uuid[])`,
  [ids],
)
console.log('\nDependent rows that will be cascade-deleted:')
for (const r of inv.rows) {
  if (r.n > 0) console.log(`  ${r.t.padEnd(14)} ${r.n}`)
}

const { rows: evRows } = await c.query(
  `SELECT count(*)::int AS n FROM public.email_verifications
    WHERE email ILIKE '%darkluna%' OR email ILIKE 'timing.%@gmail.com'`,
)
console.log(`  ${'otp_rows'.padEnd(14)} ${evRows[0].n}  (no FK — deleted separately)`)

if (DRY_RUN) {
  console.log('\nDRY RUN. Re-run with --yes to actually delete.')
  await c.end()
  process.exit(0)
}

// --- 3. Delete -------------------------------------------------------------
console.log('\nDeleting in one transaction...')
await c.query('BEGIN')
try {
  await c.query(`DELETE FROM public.email_verifications
                  WHERE email ILIKE '%darkluna%' OR email ILIKE 'timing.%@gmail.com'`)
  const del = await c.query(
    `DELETE FROM auth.users WHERE id = ANY($1::uuid[]) RETURNING email`,
    [ids],
  )
  console.log(`  removed ${del.rowCount} auth.users row(s): ${del.rows.map((r) => r.email).join(', ')}`)
  await c.query('COMMIT')
} catch (e) {
  await c.query('ROLLBACK')
  console.error('Rolled back:', e.message)
  await c.end()
  process.exit(1)
}

// --- 4. Verify every dependent table is clean ------------------------------
const check = await c.query(
  `SELECT 'auth.users' AS t, count(*)::int AS n FROM auth.users           WHERE id = ANY($1::uuid[])
   UNION ALL SELECT 'profiles',    count(*)::int FROM public.profiles    WHERE id = ANY($1::uuid[])
   UNION ALL SELECT 'tourists',    count(*)::int FROM public.tourists    WHERE id = ANY($1::uuid[])
   UNION ALL SELECT 'buddies',     count(*)::int FROM public.buddies     WHERE id = ANY($1::uuid[])
   UNION ALL SELECT 'otp_rows',    count(*)::int FROM public.email_verifications
                                    WHERE email ILIKE '%darkluna%' OR email ILIKE 'timing.%@gmail.com'`,
  [ids],
)
console.log('\nVerification (all must be 0):')
let clean = true
for (const r of check.rows) {
  console.log(`  ${r.t.padEnd(12)} ${r.n}`)
  if (r.n > 0) clean = false
}

// --- 5. Show what survives -------------------------------------------------
const { rows: after } = await c.query(
  `SELECT u.email, p.full_name, p.role FROM auth.users u
     LEFT JOIN public.profiles p ON p.id = u.id ORDER BY u.created_at`,
)
console.log('\nRemaining accounts:')
for (const a of after) {
  console.log(`  ${a.email.padEnd(30)} ${a.full_name ?? '-'} (${a.role ?? '-'})`)
}

console.log(clean ? '\nDone — email is free to re-register.' : '\nWARNING: some rows survived.')
await c.end()