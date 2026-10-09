// scripts/verify-fk-fix-v3.mjs
// Full fix verification including race condition via .upsert(ignoreDuplicates)
import { createClient } from '@supabase/supabase-js'
import { Client } from 'pg'

const URL = 'https://pqvnjgyqbxlylawwogjv.supabase.co'
const ANON = 'sb_publishable_3uRUZqdvazd4cENt8WOWJA_SB7HmCEE'
const LAN = '11111111-1111-1111-1111-111111111111'
const TOAN = 'f2df98b0-96cf-451d-9d85-5060ddc1ca01'
const JOHN = 'aaaa1111-1111-1111-1111-111111111111'

// Simulate the FULL app code path including upsert + post-upsert fallback
async function openConvV3(sb, myId, partnerId) {
  // 1. Existing check
  const { data: existing } = await sb.from('conversations')
    .select('id')
    .or(
      `and(tourist_id.eq.${myId},buddy_id.eq.${partnerId}),and(tourist_id.eq.${partnerId},buddy_id.eq.${myId})`,
    )
    .maybeSingle()
  if (existing) return { ok: true, id: existing.id, source: 'existing' }

  // 2. Resolve roles
  const { data: meProf } = await sb.from('profiles').select('role').eq('id', myId).maybeSingle()
  const { data: themProf } = await sb.from('profiles').select('role').eq('id', partnerId).maybeSingle()
  if (!meProf?.role || !themProf?.role) return { ok: false, error: 'unable to resolve roles' }
  if (meProf.role === themProf.role) {
    const plural = meProf.role === 'buddy' ? 'buddies' : meProf.role + 's'
    return { ok: false, error: `both users are ${plural}` }
  }

  // 3. Orphan check
  const myTable = meProf.role === 'buddy' ? 'buddies' : 'tourists'
  const partnerTable = themProf.role === 'buddy' ? 'buddies' : 'tourists'
  const { data: meRow } = await sb.from(myTable).select('id').eq('id', myId).maybeSingle()
  const { data: partnerRow } = await sb.from(partnerTable).select('id').eq('id', partnerId).maybeSingle()
  if (!meRow) return { ok: false, error: `your account is missing a ${meProf.role} profile row` }
  if (!partnerRow) return { ok: false, error: `the partner is missing a ${themProf.role} profile row` }

  // 4. Upsert with race-condition fix
  const insertPayload = meProf.role === 'buddy'
    ? { tourist_id: partnerId, buddy_id: myId }
    : { tourist_id: myId, buddy_id: partnerId }
  const { data: upserted, error } = await sb.from('conversations')
    .upsert(insertPayload, { onConflict: 'tourist_id,buddy_id', ignoreDuplicates: true })
    .select('id').maybeSingle()
  if (error) return { ok: false, error: error.message }
  if (upserted?.id) return { ok: true, id: upserted.id, source: 'upserted' }

  // 5. ignoreDuplicates returned empty (race: another tab inserted in parallel)
  const { data: raceWinner } = await sb.from('conversations')
    .select('id')
    .or(`and(tourist_id.eq.${myId},buddy_id.eq.${partnerId}),and(tourist_id.eq.${partnerId},buddy_id.eq.${myId})`)
    .maybeSingle()
  if (raceWinner?.id) return { ok: true, id: raceWinner.id, source: 'race-winner' }
  return { ok: false, error: 'race condition not resolved' }
}

const sb = createClient(URL, ANON, { auth: { persistSession: false } })
await sb.auth.signInWithPassword({ email: 'lan.pham@localit.dev', password: 'password123' })

const pg = new Client({
  connectionString: `postgresql://postgres:${process.env.SUPABASE_DB_PASSWORD}@db.pqvnjgyqbxlylawwogjv.supabase.co:5432/postgres`,
  ssl: { rejectUnauthorized: false },
})
await pg.connect()

const { rows: orphans } = await pg.query(`
  SELECT p.id, p.role FROM public.profiles p
  WHERE (p.role = 'tourist' AND NOT EXISTS(SELECT 1 FROM public.tourists t WHERE t.id = p.id))
`)
const ORPHAN_ID = orphans[0]?.id

let pass = 0, fail = 0
const check = (name, cond, detail) => {
  if (cond) { console.log('  PASS:', name, detail ?? ''); pass++ }
  else { console.log('  FAIL:', name, detail ?? ''); fail++ }
}

const cleanup = async () => {
  await pg.query('DELETE FROM public.conversations')
}

console.log('=== V3 Full Fix Verification ===')

console.log('\n[1] Happy: Lan (buddy) → Toan (tourist):')
await cleanup()
const r1 = await openConvV3(sb, LAN, TOAN)
check('insert succeeded', r1.ok && r1.id, JSON.stringify(r1))
check('source=upserted (no existing)', r1.source === 'upserted', JSON.stringify(r1))

console.log('\n[2] Same-role: Lan (buddy) → John (buddy):')
const r2 = await openConvV3(sb, LAN, JOHN)
check('blocked with same-role error', !r2.ok && r2.error?.includes('both users are buddies'), JSON.stringify(r2))

console.log('\n[3] Orphan partner: Lan (buddy) → orphan tourist:')
const r3 = await openConvV3(sb, LAN, ORPHAN_ID)
check('blocked with orphan error (NOT FK 23503)', !r3.ok && r3.error?.includes('missing a tourist profile row'), JSON.stringify(r3))
check('no FK violation thrown', !r3.error?.includes('FK') && !r3.error?.includes('23503'), JSON.stringify(r3))

console.log('\n[4] Existing conv re-use:')
await cleanup()
const r4a = await openConvV3(sb, LAN, TOAN)
check('first call upserted', r4a.ok && r4a.source === 'upserted', JSON.stringify(r4a))
const r4b = await openConvV3(sb, LAN, TOAN)
check('second call reuses existing', r4b.ok && r4b.source === 'existing' && r4b.id === r4a.id, JSON.stringify(r4b))

console.log('\n[5] Race condition: 2 simultaneous upserts:')
await cleanup()
const [a, b] = await Promise.all([
  openConvV3(sb, LAN, TOAN),
  openConvV3(sb, LAN, TOAN),
])
check('both calls succeeded', a.ok && b.ok, JSON.stringify({ a, b }))
check('both return same id', a.id === b.id, JSON.stringify({ a, b }))
check('one is upserted, other is race-winner or existing',
  new Set([a.source, b.source]).size <= 2 &&
  (a.source === 'upserted' || a.source === 'race-winner' || a.source === 'existing') &&
  (b.source === 'upserted' || b.source === 'race-winner' || b.source === 'existing'),
  JSON.stringify({ a_source: a.source, b_source: b.source }))

console.log('\n[6] 3 concurrent upserts:')
await cleanup()
const results = await Promise.all([
  openConvV3(sb, LAN, TOAN),
  openConvV3(sb, LAN, TOAN),
  openConvV3(sb, LAN, TOAN),
])
check('all 3 succeed', results.every(r => r.ok), JSON.stringify(results.map(r => r.source)))
check('all 3 return same id', new Set(results.map(r => r.id)).size === 1, JSON.stringify(results.map(r => r.id)))

await cleanup()
await sb.auth.signOut()
await pg.end()

console.log(`\n=== Result: ${pass} PASS, ${fail} FAIL ===`)
process.exit(fail > 0 ? 1 : 0)
