#!/usr/bin/env node
/**
 * Restore Lan Pham as a buddy. The previous fix-seed-mismatch.mjs
 * deleted her buddies row on the assumption that profiles.role was
 * the source of truth, but her buddy row (Da Nang, rating 4.9,
 * Beach/Food/Photography) is clearly the more populated of the two
 * sides — she's a local buddy, not a tourist.
 *
 * Restores:
 *   - public.buddies row with Da Nang coordinates + specialties
 *   - public.profiles.role back to 'buddy'
 *   - public.tourists row stays as-is (harmless duplicate-ish)
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

const LAN_ID = '11111111-1111-1111-1111-111111111111'

// Insert buddy row if missing
const r1 = await pg.query(
  `INSERT INTO public.buddies (
     id, location_city, latitude, longitude, languages, specialties,
     hourly_rate, bio, is_available, rating_avg, trips_completed
   ) VALUES (
     $1, 'Da Nang', 16.0544, 108.2023,
     ARRAY['Vietnamese','English']::text[],
     ARRAY['Beach','Food Tours','Photography']::text[],
     15, 'Sinh ra và lớn lên tại Đà Nẵng, mình sẽ chỉ bạn những quán ăn ngon nhất và các địa điểm văn hóa độc đáo.',
     true, 4.9, 47
   )
   ON CONFLICT (id) DO UPDATE SET
     location_city = EXCLUDED.location_city,
     latitude = EXCLUDED.latitude,
     longitude = EXCLUDED.longitude,
     specialties = EXCLUDED.specialties,
     hourly_rate = EXCLUDED.hourly_rate,
     bio = EXCLUDED.bio,
     is_available = true,
     rating_avg = EXCLUDED.rating_avg
   RETURNING id, location_city, rating_avg`,
  [LAN_ID]
)
console.log('[restore-lan] buddy row:', r1.rows[0])

// Fix role
const r2 = await pg.query(
  `UPDATE public.profiles SET role = 'buddy' WHERE id = $1 RETURNING id, full_name, role`,
  [LAN_ID]
)
console.log('[restore-lan] profile role:', r2.rows[0])

await pg.end()
console.log('\n[restore-lan] Done.')
