// fix-missing-buddies-rows.mjs — ensure every profile with role='buddy' has a buddies row
import { Client } from 'pg'

const pg = new Client({
  connectionString: 'postgresql://postgres:that1arlecchino@db.pqvnjgyqbxlylawwogjv.supabase.co:5432/postgres',
  ssl: { rejectUnauthorized: false },
})
await pg.connect()

const r = await pg.query(`
  SELECT p.id, p.full_name
  FROM public.profiles p
  LEFT JOIN public.buddies b ON b.id = p.id
  WHERE p.role = 'buddy' AND b.id IS NULL
`)
console.log(`Found ${r.rows.length} buddies without a buddies row:`)
for (const row of r.rows) console.log(' ', row.id, row.full_name)

let inserted = 0
for (const row of r.rows) {
  const i = await pg.query(`
    INSERT INTO public.buddies (
      id, location_city, languages, specialties, hourly_rate,
      is_available, favorite_places, trips_completed, rating_avg, bio
    ) VALUES (
      $1, 'Da Nang', ARRAY['English']::text[], ARRAY[]::text[], 15,
      true, ARRAY[]::text[], 0, 0, null
    )
    ON CONFLICT (id) DO NOTHING
    RETURNING id
  `, [row.id])
  if (i.rowCount && i.rowCount > 0) {
    inserted++
    console.log(`  inserted buddies row for ${row.full_name}`)
  }
}
console.log(`\nInserted ${inserted} buddies rows`)

// Same for tourists
const t = await pg.query(`
  SELECT p.id, p.full_name
  FROM public.profiles p
  LEFT JOIN public.tourists t ON t.id = p.id
  WHERE p.role = 'tourist' AND t.id IS NULL
`)
console.log(`\nFound ${t.rows.length} tourists without a tourists row:`)
for (const row of t.rows) console.log(' ', row.id, row.full_name)
let insT = 0
for (const row of t.rows) {
  await pg.query(`
    INSERT INTO public.tourists (
      id, nationality, date_of_birth, travel_style, interests,
      languages, budget_range, destination
    ) VALUES (
      $1, '', null, 'solo', ARRAY[]::text[],
      ARRAY['English']::text[], '50-100', 'Da Nang'
    )
    ON CONFLICT (id) DO NOTHING
  `, [row.id])
  insT++
}
console.log(`Inserted ${insT} tourists rows`)

await pg.end()
