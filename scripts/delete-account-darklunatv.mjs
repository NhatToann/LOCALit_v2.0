// scripts/delete-account-darklunatv.mjs
// One-shot script to remove a single account from production.
// Search criteria: profiles.full_name ILIKE '%darklunatv%' OR profiles.email ILIKE '%darklunatv%'
//
// Safe order:
//   1. Look up the user
//   2. Print everything that WILL be deleted
//   3. Confirm before wiping
//   4. Delete in dependency order (children → parent auth.users)
//   5. Verify auth.users row is gone
//
// Idempotent: re-running finds 0 rows and exits 0.
import pg from 'pg'
import readline from 'node:readline'

const { Client } = pg

const SEARCH_TERM = 'darklunatv'
const CONFIRM_PHRASE = 'delete darklunatv'

const c = new Client({
  connectionString: 'postgresql://postgres:that1arlecchino@db.pqvnjgyqbxlylawwogjv.supabase.co:5432/postgres',
  ssl: { rejectUnauthorized: false },
})
await c.connect()

// --- 1. Look up the user ---------------------------------------------------
const { rows: profileRows } = await c.query(
  `SELECT id, full_name, email, role, created_at
   FROM public.profiles
   WHERE full_name ILIKE $1 OR email ILIKE $1`,
  [`%${SEARCH_TERM}%`],
)

if (profileRows.length === 0) {
  console.log(`No profile matches "${SEARCH_TERM}". Nothing to delete.`)
  await c.end()
  process.exit(0)
}

console.log(`\nFound ${profileRows.length} profile row(s):\n`)
for (const p of profileRows) {
  console.log(`  id        = ${p.id}`)
  console.log(`  full_name = ${p.full_name}`)
  console.log(`  email     = ${p.email}`)
  console.log(`  role      = ${p.role}`)
  console.log(`  created   = ${p.created_at}`)
  console.log('')
}

const ids = profileRows.map((p) => p.id)

// --- 2. Show what each id owns across all trip-* tables --------------------
const inventoryQuery = `
  SELECT 'profiles'    AS source, count(*)::int AS rows FROM public.profiles    WHERE id = ANY($1::uuid[])
  UNION ALL SELECT 'tourists',     count(*)::int FROM public.tourists    WHERE id = ANY($1::uuid[])
  UNION ALL SELECT 'buddies',      count(*)::int FROM public.buddies     WHERE id = ANY($1::uuid[])
  UNION ALL SELECT 'connections',  count(*)::int FROM public.connections WHERE tourist_id = ANY($1::uuid[]) OR buddy_id = ANY($1::uuid[])
  UNION ALL SELECT 'conversations',count(*)::int FROM public.conversations WHERE tourist_id = ANY($1::uuid[]) OR buddy_id = ANY($1::uuid[])
  UNION ALL SELECT 'messages',     count(*)::int FROM public.messages    WHERE sender_id = ANY($1::uuid[])
  UNION ALL SELECT 'reviews',      count(*)::int FROM public.reviews     WHERE tourist_id = ANY($1::uuid[]) OR buddy_id = ANY($1::uuid[])
  UNION ALL SELECT 'location_updates', count(*)::int FROM public.location_updates WHERE profile_id = ANY($1::uuid[])
  UNION ALL SELECT 'trips',        count(*)::int FROM public.trips        WHERE tourist_id = ANY($1::uuid[]) OR buddy_id = ANY($1::uuid[])
  UNION ALL SELECT 'trip_stops',   count(*)::int FROM public.trip_stops   WHERE added_by = ANY($1::uuid[])
  UNION ALL SELECT 'trip_days',    count(*)::int FROM public.trip_days    WHERE created_by = ANY($1::uuid[])
  UNION ALL SELECT 'trip_travelers',count(*)::int FROM public.trip_travelers WHERE tourist_id = ANY($1::uuid[])
  UNION ALL SELECT 'trip_buddies', count(*)::int FROM public.trip_buddies  WHERE buddy_id = ANY($1::uuid[])
  UNION ALL SELECT 'trip_activity',count(*)::int FROM public.trip_activity WHERE actor_id = ANY($1::uuid[])
  UNION ALL SELECT 'message_reactions', count(*)::int FROM public.message_reactions WHERE profile_id = ANY($1::uuid[])
  UNION ALL SELECT 'auth.users',   count(*)::int FROM auth.users           WHERE id = ANY($1::uuid[])
`

const { rows: inv } = await c.query(inventoryQuery, [ids])
console.log('Rows that will be removed (FK cascade handles children automatically):\n')
for (const r of inv) {
  const marker = r.rows > 0 ? '✗' : '·'
  console.log(`  ${marker} ${r.source.padEnd(20)} ${r.rows}`)
}
console.log('')

// --- 3. Confirm before wiping ----------------------------------------------
const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
const answer = await new Promise((resolve) =>
  rl.question(
    `Type "${CONFIRM_PHRASE}" to DELETE these account(s) from production (or anything else to abort): `,
    resolve,
  ),
)
rl.close()

if (answer.trim().toLowerCase() !== CONFIRM_PHRASE) {
  console.log('Aborted. Nothing was deleted.')
  await c.end()
  process.exit(0)
}

// --- 4. Delete in dependency order -----------------------------------------
console.log('\nDeleting in one transaction...')
await c.query('BEGIN')
try {
  // Children with FK → parent must be deleted first OR we delete auth.users
  // and let the cascade do it. Profiles.id is FK ON DELETE CASCADE from
  // tourists/buddies; auth.users.id is FK ON DELETE CASCADE from profiles.
  //
  // We delete auth.users directly and let CASCADE wipe everything.
  // But: trip_stops.added_by and trip_activity.actor_id have ON DELETE SET NULL,
  // and trip_travelers/buddies should be removed to avoid orphaned trip memberships.
  // The safest path is to DELETE FROM auth.users and verify cascade behavior.

  // First: explicitly remove trip_membership rows so the trip doesn't keep a
  // dangling reference (these have ON DELETE CASCADE to trips, but if the trip
  // belongs to OTHER people we don't want to drop the whole trip).
  await c.query('DELETE FROM public.trip_travelers WHERE tourist_id = ANY($1::uuid[])', [ids])
  await c.query('DELETE FROM public.trip_buddies    WHERE buddy_id    = ANY($1::uuid[])', [ids])

  // Conversations are owned by 2 parties. If only 1 party is being deleted,
  // keep the conversation but null the FK. Look up the FK column first.
  const convCols = await c.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema='public' AND table_name='conversations'`,
  )
  const convColNames = convCols.rows.map((r) => r.column_name).filter((n) => n.endsWith('_id') && n !== 'id')
  for (const col of convColNames) {
    await c.query(`UPDATE public.conversations SET ${col} = NULL WHERE ${col} = ANY($1::uuid[])`, [ids])
  }

  // Now drop auth.users — cascade handles profiles, tourists, buddies,
  // connections, messages, location_updates, reviews, trips, trip_stops,
  // trip_days, trip_budget, trip_bookings, trip_packing_items, trip_activity.
  const del = await c.query('DELETE FROM auth.users WHERE id = ANY($1::uuid[]) RETURNING id, email', [ids])
  console.log(`Deleted ${del.rowCount} auth.users row(s):`)
  for (const row of del.rows) {
    console.log(`  ${row.id}  ${row.email}`)
  }

  await c.query('COMMIT')
} catch (e) {
  await c.query('ROLLBACK')
  throw e
}

// --- 5. Verify gone --------------------------------------------------------
const verify = await c.query(
  `SELECT 'auth.users'  AS source, count(*)::int AS n FROM auth.users  WHERE id = ANY($1::uuid[])
   UNION ALL SELECT 'profiles',    count(*)::int FROM public.profiles WHERE id = ANY($1::uuid[])
   UNION ALL SELECT 'tourists',    count(*)::int FROM public.tourists WHERE id = ANY($1::uuid[])
   UNION ALL SELECT 'buddies',     count(*)::int FROM public.buddies  WHERE id = ANY($1::uuid[])`,
  [ids],
)
console.log('\nVerification (all must be 0):')
for (const r of verify.rows) console.log(`  ${r.source.padEnd(15)} ${r.n}`)

console.log('\nDone. You can re-register the same email now.')
await c.end()
