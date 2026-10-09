#!/usr/bin/env node
/**
 * Fix seed data pollution:
 *   - Lan Pham (id=11111111-...) has BOTH a public.buddies row and a
 *     public.tourists row, but role='tourist' on profiles. This makes
 *     her appear in BOTH the buddy list and the tourist list on
 *     /browse.
 *   - John Doe (id=aaaa1111-...) is the inverse: role='buddy' on
 *     profiles but only a tourists row, no buddies row.
 *
 * The fix: align each user's public.profiles.role with the side they
 * ACTUALLY have a row on. If they have a buddy row, role='buddy';
 * if they have a tourist row, role='tourist'. Only flip when exactly
 * ONE side has data (the case for these two seeds).
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
  WITH
    buddy_set AS (SELECT id FROM public.buddies),
    tourist_set AS (SELECT id FROM public.tourists),
    summary AS (
      SELECT p.id, p.role, p.email, p.full_name,
             (b.id IS NOT NULL) AS has_buddy_row,
             (t.id IS NOT NULL) AS has_tourist_row
      FROM public.profiles p
      LEFT JOIN buddy_set b ON b.id = p.id
      LEFT JOIN tourist_set t ON t.id = p.id
    )
  SELECT * FROM summary
  WHERE (has_buddy_row AND role <> 'buddy')
     OR (has_tourist_row AND role <> 'tourist')
     OR (has_buddy_row AND has_tourist_row)
  ORDER BY email
`)
console.log(`[fix-seed-mismatch] ${r.rows.length} mismatched profile(s):`)
console.table(r.rows)

let fixed = 0
for (const row of r.rows) {
  if (row.has_buddy_row && row.has_tourist_row) {
    // Two-sided: choose based on which role is currently in profiles,
    // and delete the other row.
    if (row.role === 'buddy') {
      await pg.query('DELETE FROM public.tourists WHERE id = $1', [row.id])
      console.log(`  - ${row.email}: kept buddy, deleted tourist row`)
    } else {
      await pg.query('DELETE FROM public.buddies WHERE id = $1', [row.id])
      console.log(`  - ${row.email}: kept tourist, deleted buddy row`)
    }
    fixed++
  } else if (row.has_buddy_row && row.role !== 'buddy') {
    await pg.query('UPDATE public.profiles SET role = $2 WHERE id = $1', [row.id, 'buddy'])
    console.log(`  - ${row.email}: role -> 'buddy'`)
    fixed++
  } else if (row.has_tourist_row && row.role !== 'tourist') {
    await pg.query('UPDATE public.profiles SET role = $2 WHERE id = $1', [row.id, 'tourist'])
    console.log(`  - ${row.email}: role -> 'tourist'`)
    fixed++
  }
}
console.log(`\n[fix-seed-mismatch] ${fixed} profile(s) corrected.`)
await pg.end()
