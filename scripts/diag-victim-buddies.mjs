// Inspects the buddy rows owned by the accounts targeted for deletion.
// A tourist-role profile owning a buddies row is the same seed-pollution
// pattern fixed on 2026-10-09 (scripts/fix-seed-mismatch.mjs), but here it
// would mean deleting a visible buddy from /browse along with the accounts.
import pg from 'pg'
const c = new pg.Client({
  connectionString: 'postgresql://postgres:that1arlecchino@db.pqvnjgyqbxlylawwogjv.supabase.co:5432/postgres',
  ssl: { rejectUnauthorized: false },
})
await c.connect()

const { rows: victims } = await c.query(
  `SELECT u.id, u.email, p.full_name, p.role,
          b.location_city, b.bio, b.specialties, b.languages, b.rating_avg,
          b.trips_completed, b.hourly_rate
     FROM auth.users u
     LEFT JOIN public.profiles p ON p.id = u.id
     LEFT JOIN public.buddies  b ON b.id = u.id
    WHERE u.email ILIKE '%darkluna%' OR u.email ILIKE 'timing.%@gmail.com'`,
)

for (const v of victims) {
  console.log(`\n=== ${v.email} ===`)
  console.log(`  id       = ${v.id}`)
  console.log(`  name     = ${v.full_name}`)
  console.log(`  role     = ${v.role}`)
  if (v.location_city) {
    console.log(`  HAS buddies ROW:`)
    console.log(`    city            = ${v.location_city}`)
    console.log(`    specialties     = ${JSON.stringify(v.specialties)}`)
    console.log(`    languages       = ${JSON.stringify(v.languages)}`)
    console.log(`    rating_avg      = ${v.rating_avg}`)
    console.log(`    trips_completed = ${v.trips_completed}`)
    console.log(`    hourly_rate     = ${v.hourly_rate}`)
    console.log(`    bio             = ${(v.bio ?? '(none)').slice(0, 120)}`)
  } else {
    console.log('  no buddies row (tourist-only)')
  }
}

// How many buddies are currently visible on /browse?
const { rows: allBuddies } = await c.query(
  `SELECT b.id, p.full_name, p.role, b.is_available, b.rating_avg, b.bio
     FROM public.buddies b
     JOIN public.profiles p ON p.id = b.id
    ORDER BY b.rating_avg DESC NULLS LAST`,
)
console.log(`\n=== all buddies (${allBuddies.length}) ===`)
for (const b of allBuddies) {
  console.log(`  ${(b.full_name ?? '?').padEnd(22)} role=${b.role ?? '-'} avail=${b.is_available} rating=${b.rating_avg ?? '-'}`)
}

await c.end()