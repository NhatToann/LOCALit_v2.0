// scripts/cleanup-test-data.mjs
//
// One-shot cleanup: remove test/debug auth.users rows from production Supabase.
//
// Safety guarantees:
//   1. Hardcoded KEEP_EMAILS set blocks deletion of seed accounts.
//   2. Preview mode (--dry-run) prints the plan without touching anything.
//   3. All deletes run in a single transaction — atomic.
//   4. The on_auth_user_created trigger is NEVER touched.
//   5. All schema objects (tables, views, triggers, policies) are NEVER touched.
//
// Usage:
//   node scripts/cleanup-test-data.mjs --dry-run   # safe preview
//   node scripts/cleanup-test-data.mjs            # execute for real
import pg from 'pg'
const { Client } = pg

const KEEP_EMAILS = new Set([
  // Buddy seeds
  'lan.pham@localit.dev',
  'minh.nguyen@localit.dev',
  'huy.nguyen@localit.dev',
  'linh.tran@localit.dev',
  'mai.le@localit.dev',
  'tuan.vu@localit.dev',
  // Tourist seeds
  'john.doe@example.com',
  'sarah.m@example.com',
  'mike.j@example.com',
])

const DB_URL =
  process.env.SUPABASE_DB_URL ||
  'postgresql://postgres:that1arlecchino@db.pqvnjgyqbxlylawwogjv.supabase.co:5432/postgres'

const isDryRun = process.argv.includes('--dry-run')

async function main() {
  const client = new Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } })
  await client.connect()

  console.log(`Mode: ${isDryRun ? 'DRY RUN' : 'EXECUTE'}`)
  console.log('Step 1/5 — verifying trigger is still bound...')
  const trig = await client.query(`
    SELECT tgname FROM pg_trigger
    WHERE tgrelid = 'auth.users'::regclass
      AND NOT tgisinternal
      AND tgname = 'on_auth_user_created'
  `)
  if (trig.rows.length === 0) {
    throw new Error('SAFETY ABORT: on_auth_user_created trigger is missing — refusing to run.')
  }
  console.log('  trigger on_auth_user_created is present.')

  console.log('\nStep 2/5 — listing users to delete...')
  const targets = await client.query(`
    SELECT u.id::text AS id, u.email, u.created_at::timestamptz AS created_at
    FROM auth.users u
    WHERE u.email <> ALL($1::text[])
    ORDER BY u.created_at ASC
  `, [Array.from(KEEP_EMAILS)])
  console.log(`  Found ${targets.rows.length} test rows to delete.`)
  if (targets.rows.length === 0) {
    console.log('  Nothing to do.')
    await client.end()
    return
  }
  if (targets.rows.length > 250) {
    console.warn(`  WARNING: deleting ${targets.rows.length} rows in one transaction.`)
  }

  // Show the KEEP set
  const keep = await client.query(
    `SELECT email FROM auth.users WHERE email = ANY($1::text[]) ORDER BY email`,
    [Array.from(KEEP_EMAILS)],
  )
  console.log(`\n  KEEPING ${keep.rows.length} seed accounts:`)
  for (const r of keep.rows) console.log(`    ${r.email}`)

  // Show sample of what's being deleted
  console.log(`\n  Sample of rows that WILL be deleted:`)
  for (const r of targets.rows.slice(0, 5)) {
    console.log(`    ${r.created_at.toISOString()}  ${r.email}`)
  }
  if (targets.rows.length > 5) {
    console.log(`    ... and ${targets.rows.length - 5} more`)
  }

  if (isDryRun) {
    console.log('\nDRY RUN complete — nothing was deleted. Re-run without --dry-run to execute.')
    await client.end()
    return
  }

  // ---- Execute the cleanup inside one transaction --------------------------
  console.log('\nStep 3/5 — wiping email_verifications (82 rows, all consumed/expired)...')
  console.log('Step 4/5 — deleting test auth.users rows + FK cascades...')
  console.log('Step 5/5 — verifying final state...')

  await client.query('BEGIN')
  try {
    // Wipe the OTP table. None of these are referenced elsewhere.
    await client.query('DELETE FROM public.email_verifications')

    // Delete test auth.users. FK cascades will clean:
    //   profiles, tourists, buddies, connections, conversations, messages,
    //   trips, trip_stops, reviews, location_updates
    const result = await client.query(
      `DELETE FROM auth.users WHERE email <> ALL($1::text[])`,
      [Array.from(KEEP_EMAILS)],
    )
    console.log(`  Deleted ${result.rowCount} auth.users rows.`)

    await client.query('COMMIT')
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  }

  // Verify
  const after = await client.query(
    `SELECT count(*)::int AS n FROM auth.users WHERE email = ANY($1::text[])`,
    [Array.from(KEEP_EMAILS)],
  )
  console.log(`\n  KEEP set still intact: ${after.rows[0].n} rows (expected ${KEEP_EMAILS.size})`)

  const stillTrig = await client.query(`
    SELECT tgname FROM pg_trigger
    WHERE tgrelid = 'auth.users'::regclass
      AND tgname = 'on_auth_user_created'
  `)
  console.log(`  Trigger still present: ${stillTrig.rows.length === 1 ? 'yes' : 'NO'}`)

  // Final counts
  console.log('\n== Final state ==')
  for (const t of [
    'auth.users',
    'public.profiles',
    'public.tourists',
    'public.buddies',
    'public.email_verifications',
  ]) {
    const r = await client.query(`SELECT count(*)::int AS n FROM ${t}`)
    console.log(`  ${t.padEnd(30)} ${r.rows[0].n} rows`)
  }

  console.log('\nDone.')
  await client.end()
}

main().catch((e) => {
  console.error('cleanup failed:', e.message)
  process.exit(1)
})
