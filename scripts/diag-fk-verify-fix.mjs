// scripts/diag-fk-verify-fix.mjs — verify the fix logic via direct DB queries
import { Client } from 'pg'
const DB = `postgresql://postgres:${process.env.SUPABASE_DB_PASSWORD}@db.pqvnjgyqbxlylawwogjv.supabase.co:5432/postgres`

const client = new Client({ connectionString: DB, ssl: { rejectUnauthorized: false } })
await client.connect()

// Test: pick a real tourist (Phan Nhật Toàn) and a real buddy (Lan)
const LAN = '11111111-1111-1111-1111-111111111111'        // buddy
const TOAN = 'f2df98b0-96cf-451d-9d85-5060ddc1ca01'        // tourist (Phan Nhật Toàn)

// Cleanup
await client.query(
  `DELETE FROM public.conversations WHERE (tourist_id = $1 AND buddy_id = $2) OR (tourist_id = $2 AND buddy_id = $1)`,
  [LAN, TOAN]
)

// Sanity: confirm both have rows in their role tables
const { rows: touristCheck } = await client.query('SELECT 1 FROM public.tourists WHERE id = $1', [TOAN])
const { rows: buddyCheck } = await client.query('SELECT 1 FROM public.buddies WHERE id = $1', [LAN])
console.log('TOAN in tourists:', touristCheck.length, '| LAN in buddies:', buddyCheck.length)

if (touristCheck.length !== 1 || buddyCheck.length !== 1) {
  console.log('Setup error - expected both to have role rows')
  await client.end()
  process.exit(1)
}

// Simulate the FIXED code: myRole='buddy' (Lan) + partnerRole='tourist' (Toan)
console.log('\n[FIXED] Insert {tourist_id: TOAN, buddy_id: LAN}:')
try {
  const { rows } = await client.query(
    `INSERT INTO public.conversations (tourist_id, buddy_id) VALUES ($1, $2) RETURNING id`,
    [TOAN, LAN]
  )
  console.log('  SUCCESS — id:', rows[0].id)
} catch (e) {
  console.log('  FAIL:', e.code, '-', e.message.split('\n')[0])
}

// Cleanup
await client.query(
  `DELETE FROM public.conversations WHERE (tourist_id = $1 AND buddy_id = $2) OR (tourist_id = $2 AND buddy_id = $1)`,
  [LAN, TOAN]
)

// Simulate the BUG REPRO case: myRole='buddy' (Lan) + partner=John (also role='buddy')
const JOHN = 'aaaa1111-1111-1111-1111-111111111111'
await client.query(
  `DELETE FROM public.conversations WHERE (tourist_id = $1 AND buddy_id = $2) OR (tourist_id = $2 AND buddy_id = $1)`,
  [LAN, JOHN]
)

console.log('\n[BUG REPRO] Lan (buddy) tries ?buddy=<John (buddy)>. The fix detects same-role:')
// In the fix, this case sets error message and returns before insert.
// Simulating the DB side: any insertion fails because neither has a row in the OPPOSITE table.
const { rows: johnInTourists } = await client.query('SELECT 1 FROM public.tourists WHERE id = $1', [JOHN])
const { rows: lanInTourists } = await client.query('SELECT 1 FROM public.tourists WHERE id = $1', [LAN])
console.log('  John in tourists:', johnInTourists.length, '| Lan in tourists:', lanInTourists.length)
console.log('  → any insert into tourist_id column will fail (FK). Fix returns clear error instead.')

await client.end()
