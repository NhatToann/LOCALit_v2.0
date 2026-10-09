#!/usr/bin/env node
/**
 * Re-think: for two-sided users (both buddy + tourist rows), use a
 * domain heuristic instead of profiles.role:
 *   - If the buddy row has specialties, hourly_rate, OR rating_avg > 0,
 *     the user is a buddy (delete the tourist row).
 *   - Otherwise they're a tourist (delete the buddy row).
 *
 * This is the inverse of the previous script — the previous one chose
 * based on profiles.role, but profiles.role was the field that was
 * wrong. The actual data on the buddy / tourist rows is the source of
 * truth.
 */
import { Client } from 'pg'

const pw = process.env.DB_PW || process.env.SUPABASE_DB_PASSWORD
if (!pw) { console.error('Set DB_PW'); process.exit(1) }
const pg = new Client({
  host: 'db.pqvnjgyqbxlylawwogjv.supabase.co',
  port: 5432,
  user: 'postgres', password: pw, database: 'postgres',
  ssl: { rejectUnauthorized: false },
})
await pg.connect()

const r = await pg.query(`
  WITH both AS (
    SELECT b.id,
           b.specialties, b.hourly_rate, b.rating_avg,
           t.interests, t.travel_style
    FROM public.buddies b
    JOIN public.tourists t ON t.id = b.id
  )
  SELECT b.id, p.email, p.full_name, p.role AS current_role,
         b.specialties, b.hourly_rate, b.rating_avg,
         t.interests
  FROM both b
  JOIN public.profiles p ON p.id = b.id
  LEFT JOIN public.tourists t ON t.id = b.id
  ORDER BY p.email
`)
console.log(`[fix-two-sided] ${r.rows.length} two-sided user(s):`)
console.table(r.rows)

for (const row of r.rows) {
  // Heuristic: buddy score = (specialties length > 0) + (hourly_rate > 0) + (rating_avg > 0)
  const buddyScore = (row.specialties?.length || 0) > 0 ? 1 : 0
    + (Number(row.hourly_rate) || 0) > 0 ? 1 : 0
    + (Number(row.rating_avg) || 0) > 0 ? 1 : 0
  // Tourist score = interests length > 0
  const touristScore = (row.interests?.length || 0) > 0 ? 1 : 0

  if (buddyScore > touristScore) {
    // User is a buddy. Delete the tourist row, set role='buddy'.
    await pg.query('DELETE FROM public.tourists WHERE id = $1', [row.id])
    await pg.query('UPDATE public.profiles SET role = $2 WHERE id = $1', [row.id, 'buddy'])
    console.log(`  - ${row.email}: BUDDY (score ${buddyScore} > ${touristScore}); deleted tourist row`)
  } else {
    // User is a tourist.
    await pg.query('DELETE FROM public.buddies WHERE id = $1', [row.id])
    await pg.query('UPDATE public.profiles SET role = $2 WHERE id = $1', [row.id, 'tourist'])
    console.log(`  - ${row.email}: TOURIST (score ${touristScore} >= ${buddyScore}); deleted buddy row`)
  }
}

await pg.end()
console.log(`\n[fix-two-sided] Done.`)
