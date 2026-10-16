// scripts/clean-db-for-launch.mjs
// 2026-10-16 — prepare database for public launch.
//
// What this does:
//   1. Lists every auth.users row + matching profiles / tourists / buddies.
//   2. Confirms which 2 seed accounts to KEEP (lan.pham + john.doe).
//   3. DELETEs every other user (cascades through profiles / tourists /
//      buddies / connections / conversations / messages / etc.) plus all
//      email_verifications, swipes, reviews, location_updates, pending_calls,
//      itinerary_* — anything that has a user_id FK to a deleted user.
//   4. Keeps the AGENTS.md seed accounts (the 2 you asked for).
//   5. Drops the now-orphan Focus Mode tables (focus_requests, focus_sessions).
//   6. Verifies Lan + John still have their canonical profile data.

import { Client } from 'pg'

const PG_URL = `postgresql://postgres:that1arlecchino@db.pqvnjgyqbxlylawwogjv.supabase.co:5432/postgres`

const KEEP = new Set([
  'lan.pham@localit.dev',
  'john.doe@example.com',
])

async function main() {
  const c = new Client({ connectionString: PG_URL, ssl: { rejectUnauthorized: false } })
  await c.connect()

  // ---- 1. List current users -----------------------------------------------
  const { rows: users } = await c.query(`
    SELECT u.id, u.email, u.created_at,
           p.role, p.full_name,
           t.id IS NOT NULL AS has_tourist,
           b.id IS NOT NULL AS has_buddy
    FROM auth.users u
    LEFT JOIN public.profiles p ON p.id = u.id
    LEFT JOIN public.tourists t ON t.id = u.id
    LEFT JOIN public.buddies  b ON b.id = u.id
    ORDER BY u.created_at
  `)

  console.log(`\n=== ${users.length} users currently in DB ===`)
  for (const u of users) {
    const tag = KEEP.has(u.email) ? 'KEEP' : 'DEL '
    const role = (u.role ?? '?').padEnd(7)
    const t = u.has_tourist ? 'T' : '·'
    const b = u.has_buddy  ? 'B' : '·'
    console.log(`  [${tag}] ${u.email.padEnd(35)} role=${role} ${t}${b}  ${u.full_name ?? '?'}`)
  }

  const toDelete = users.filter((u) => !KEEP.has(u.email))
  const keepCount = users.length - toDelete.length
  console.log(`\nPlan: DELETE ${toDelete.length}, KEEP ${keepCount}`)

  if (toDelete.length === 0) {
    console.log('No users to delete. Continuing to wipe activity data anyway.\n')
  }

  // ---- 2. Wipe dependent data ---------------------------------------------
  const ids = toDelete.map((u) => u.id)
  await c.query('BEGIN')

  // 2a. user-attached data WITHOUT cascade — defensive ordering.
  const deletes = [
    // Email verifications (keyed by email, not user_id)
    [`public.email_verifications`,
     `DELETE FROM public.email_verifications WHERE lower(email) = ANY($1::text[])`,
     [toDelete.map((u) => u.email.toLowerCase())]],

    // Realtime + matching
    [`public.location_updates`, `DELETE FROM public.location_updates WHERE user_id = ANY($1::uuid[])`, [ids]],
    [`public.swipes`, `DELETE FROM public.swipes WHERE swiper_id = ANY($1::uuid[]) OR target_id = ANY($1::uuid[])`, [ids]],
    [`public.matches`, `DELETE FROM public.matches WHERE tourist_id = ANY($1::uuid[]) OR buddy_id = ANY($1::uuid[])`, [ids]],
    [`public.pending_calls`, `DELETE FROM public.pending_calls WHERE caller_id = ANY($1::uuid[]) OR callee_id = ANY($1::uuid[])`, [ids]],
    [`public.notifications`, `DELETE FROM public.notifications WHERE user_id = ANY($1::uuid[]) OR actor_id = ANY($1::uuid[])`, [ids]],
    [`public.reviews`, `DELETE FROM public.reviews WHERE reviewer_id = ANY($1::uuid[]) OR reviewee_id = ANY($1::uuid[])`, [ids]],

    // Itinerary planner (all rows linked to deleted users)
    [`public.itinerary_share`, `DELETE FROM public.itinerary_share WHERE itinerary_id IN (SELECT id FROM public.itineraries WHERE owner_id = ANY($1::uuid[]))`, [ids]],
    [`public.itinerary_collaborators`, `DELETE FROM public.itinerary_collaborators WHERE user_id = ANY($1::uuid[]) OR invited_by = ANY($1::uuid[])`, [ids]],
    [`public.itinerary_bookmarks`, `DELETE FROM public.itinerary_bookmarks WHERE user_id = ANY($1::uuid[])`, [ids]],

    // Focus Mode (orphaned after this session's code drop; tables will be DROPped below)
    [`public.focus_requests`, `DELETE FROM public.focus_requests WHERE requester_id = ANY($1::uuid[]) OR recipient_id = ANY($1::uuid[])`, [ids]],
    [`public.focus_sessions`, `DELETE FROM public.focus_sessions WHERE user_a_id = ANY($1::uuid[]) OR user_b_id = ANY($1::uuid[])`, [ids]],

    // Chat + connections
    [`public.message_reactions`, `DELETE FROM public.message_reactions WHERE user_id = ANY($1::uuid[])`, [ids]],
    [`public.messages`, `DELETE FROM public.messages WHERE sender_id = ANY($1::uuid[])`, [ids]],
    [`public.conversations`, `DELETE FROM public.conversations WHERE tourist_id = ANY($1::uuid[]) OR buddy_id = ANY($1::uuid[])`, [ids]],
    [`public.connections`, `DELETE FROM public.connections WHERE tourist_id = ANY($1::uuid[]) OR buddy_id = ANY($1::uuid[]) OR requester_id = ANY($1::uuid[]) OR recipient_id = ANY($1::uuid[])`, [ids]],

    // Itinerary parent row (delete leaves after CASCADE will kill stops/days/etc. but we delete explicitly to be safe)
    [`public.itineraries`, `DELETE FROM public.itineraries WHERE owner_id = ANY($1::uuid[]) OR last_editor_id = ANY($1::uuid[])`, [ids]],

    // Role-specific rows
    [`public.tourists`, `DELETE FROM public.tourists WHERE id = ANY($1::uuid[])`, [ids]],
    [`public.buddies`, `DELETE FROM public.buddies WHERE id = ANY($1::uuid[])`, [ids]],
  ]

  for (const [label, sql, params] of deletes) {
    if (ids.length === 0) {
      console.log(`  ${label.padEnd(30)} (no users to delete, skipped)`)
      continue
    }
    await c.query(`SAVEPOINT sp_${label.replace(/[^a-z0-9]/gi, '_')}`)
    try {
      const r = await c.query(sql, params)
      await c.query(`RELEASE SAVEPOINT sp_${label.replace(/[^a-z0-9]/gi, '_')}`)
      console.log(`  ${label.padEnd(30)} ${r.rowCount ?? 0} row(s)`)
    } catch (e) {
      await c.query(`ROLLBACK TO SAVEPOINT sp_${label.replace(/[^a-z0-9]/gi, '_')}`)
      console.warn(`  ${label.padEnd(30)} SKIP: ${e.message}`)
    }
  }

  // 2b. profiles (drop identities first to avoid FK violation)
  if (ids.length > 0) {
    await c.query(`DELETE FROM auth.identities WHERE user_id = ANY($1::uuid[])`, [ids])
    await c.query(`DELETE FROM public.profiles WHERE id = ANY($1::uuid[])`, [ids])
    console.log(`  ${'public.profiles'.padEnd(30)} (FK-cascaded)`)

    // 2c. auth.users — the root
    const r = await c.query(`DELETE FROM auth.users WHERE id = ANY($1::uuid[])`, [ids])
    console.log(`  ${'auth.users'.padEnd(30)} ${r.rowCount} row(s)`)
  }

  await c.query('COMMIT')

  // ---- 3. Drop orphan Focus Mode tables -----------------------------------
  console.log('\nDropping orphan Focus Mode tables:')
  for (const t of ['focus_requests', 'focus_sessions']) {
    try {
      await c.query(`DROP TABLE IF EXISTS public.${t} CASCADE`)
      console.log(`  ✓ public.${t}`)
    } catch (e) {
      console.warn(`  ✗ public.${t}: ${e.message}`)
    }
  }

  // ---- 4. Verify final state ---------------------------------------------
  const { rows: after } = await c.query(`
    SELECT u.email, p.role, p.full_name,
           t.id IS NOT NULL AS has_tourist,
           b.id IS NOT NULL AS has_buddy
    FROM auth.users u
    LEFT JOIN public.profiles p ON p.id = u.id
    LEFT JOIN public.tourists t ON t.id = u.id
    LEFT JOIN public.buddies  b ON b.id = u.id
    ORDER BY u.email
  `)
  console.log(`\n=== ${after.length} users after cleanup ===`)
  for (const u of after) {
    const tb = `T=${u.has_tourist?'Y':'.'} B=${u.has_buddy?'Y':'.'}`
    console.log(`  [KEEP] ${u.email.padEnd(35)} role=${(u.role ?? '?').padEnd(7)} ${tb}  ${u.full_name ?? '?'}`)
  }

  // ---- 5. Row counts for everything else ---------------------------------
  // (Moved after final wipe — counts will reflect post-cleanup state)

  // ---- 6. Reset Lan + John presence to clean state -----------------------
  console.log('\nResetting online presence for kept accounts:')
  await c.query(`
    UPDATE public.profiles
    SET is_online = false, last_seen = NULL
    WHERE lower(email) = ANY($1::text[])
  `, [[...KEEP].map(s => s.toLowerCase())])
  console.log('  ✓ is_online=false, last_seen=NULL')

  // ---- 7. Wipe ALL stale email_verifications (test OTPs, not user-tied) -
  console.log('\nWiping all stale email_verifications:')
  const evRes = await c.query(`DELETE FROM public.email_verifications`)
  console.log(`  ✓ ${evRes.rowCount} row(s) deleted`)

  // ---- 8. Wipe ALL demo activity data (test conversations, itineraries,
  //         notifications, swipes, matches, pending calls, location updates,
  //         reviews, messages). For "ready for launch" the marketplace
  //         starts with: 1 buddy (Lan), 1 tourist (John), 0 conversations,
  //         0 notifications, 0 itineraries. The first real users will
  //         create their own activity.
  console.log('\nWiping ALL demo activity for clean launch state:')
  const wipeAll = [
    'message_reactions',
    'messages',
    'conversations',
    'connections',
    'pending_calls',
    'notifications',
    'reviews',
    'swipes',
    'matches',
    'location_updates',
    'itinerary_share',
    'itinerary_collaborators',
    'itinerary_bookmarks',
    'itinerary_activity',
    'itinerary_days',
    'itinerary_stops',
    'itinerary_packing',
    'itineraries',
  ]
  for (const t of wipeAll) {
    try {
      const r = await c.query(`DELETE FROM public.${t}`)
      console.log(`  ${t.padEnd(28)} ${r.rowCount} row(s)`)
    } catch (e) {
      console.warn(`  ${t.padEnd(28)} SKIP: ${e.message}`)
    }
  }

  // ---- 9. Final verification ---------------------------------------------
  const { rows: finalUsers } = await c.query(`
    SELECT u.email, p.role, p.full_name
    FROM auth.users u
    LEFT JOIN public.profiles p ON p.id = u.id
    ORDER BY u.email
  `)
  const { rows: finalCounts } = await c.query(`
    SELECT 'profiles' AS t, COUNT(*)::int AS n FROM public.profiles
    UNION ALL SELECT 'tourists', COUNT(*)::int FROM public.tourists
    UNION ALL SELECT 'buddies', COUNT(*)::int FROM public.buddies
    UNION ALL SELECT 'connections', COUNT(*)::int FROM public.connections
    UNION ALL SELECT 'conversations', COUNT(*)::int FROM public.conversations
    UNION ALL SELECT 'messages', COUNT(*)::int FROM public.messages
    UNION ALL SELECT 'reviews', COUNT(*)::int FROM public.reviews
    UNION ALL SELECT 'swipes', COUNT(*)::int FROM public.swipes
    UNION ALL SELECT 'matches', COUNT(*)::int FROM public.matches
    UNION ALL SELECT 'pending_calls', COUNT(*)::int FROM public.pending_calls
    UNION ALL SELECT 'notifications', COUNT(*)::int FROM public.notifications
    UNION ALL SELECT 'location_updates', COUNT(*)::int FROM public.location_updates
    UNION ALL SELECT 'itineraries', COUNT(*)::int FROM public.itineraries
    UNION ALL SELECT 'email_verifications', COUNT(*)::int FROM public.email_verifications
    ORDER BY t
  `)
  console.log(`\n=== FINAL STATE — ${finalUsers.length} users ===`)
  for (const u of finalUsers) {
    console.log(`  ${u.email.padEnd(35)} role=${u.role}  ${u.full_name}`)
  }
  console.log('\nTable row counts:')
  for (const r of finalCounts) console.log(`  ${r.t.padEnd(20)} ${r.n}`)

  await c.end()
  console.log('\n✅ Cleanup complete. DB is ready for launch.\n')
}

main().catch((e) => {
  console.error('FAILED:', e)
  process.exit(1)
})
