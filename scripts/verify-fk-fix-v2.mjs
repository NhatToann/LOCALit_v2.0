// scripts/verify-fk-fix-v2.mjs
// Comprehensive verification of the orphan-profile fix
import { createClient } from '@supabase/supabase-js'
import { Client } from 'pg'

const URL = 'https://pqvnjgyqbxlylawwogjv.supabase.co'
const ANON = 'sb_publishable_3uRUZqdvazd4cENt8WOWJA_SB7HmCEE'
const LAN = '11111111-1111-1111-1111-111111111111'
const TOAN = 'f2df98b0-96cf-451d-9d85-5060ddc1ca01'
const JOHN = 'aaaa1111-1111-1111-1111-111111111111'

// Simulates the EXACT code path in app/chat/page.tsx (now with orphan check)
async function openConv(sb, myId, partnerId) {
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

  // 3. NEW: Orphan check
  const myTable = meProf.role === 'buddy' ? 'buddies' : 'tourists'
  const partnerTable = themProf.role === 'buddy' ? 'buddies' : 'tourists'
  const { data: meRow } = await sb.from(myTable).select('id').eq('id', myId).maybeSingle()
  const { data: partnerRow } = await sb.from(partnerTable).select('id').eq('id', partnerId).maybeSingle()
  if (!meRow) return { ok: false, error: `your account is missing a ${meProf.role} profile row` }
  if (!partnerRow) return { ok: false, error: `the partner is missing a ${themProf.role} profile row` }

  // 4. Insert
  const insertPayload = meProf.role === 'buddy'
    ? { tourist_id: partnerId, buddy_id: myId }
    : { tourist_id: myId, buddy_id: partnerId }
  const { data: created, error } = await sb.from('conversations')
    .insert(insertPayload).select('id').single()
  if (error) return { ok: false, error: error.message }
  return { ok: true, id: created.id, source: 'created' }
}

const sb = createClient(URL, ANON, { auth: { persistSession: false } })
await sb.auth.signInWithPassword({ email: 'lan.pham@localit.dev', password: 'password123' })

// Find orphan IDs
const pg = new Client({
  connectionString: `postgresql://postgres:${process.env.SUPABASE_DB_PASSWORD}@db.pqvnjgyqbxlylawwogjv.supabase.co:5432/postgres`,
  ssl: { rejectUnauthorized: false },
})
await pg.connect()
const { rows: orphans } = await pg.query(`
  SELECT p.id, p.role FROM public.profiles p
  WHERE (p.role = 'tourist' AND NOT EXISTS(SELECT 1 FROM public.tourists t WHERE t.id = p.id))
     OR (p.role = 'buddy' AND NOT EXISTS(SELECT 1 FROM public.buddies b WHERE b.id = p.id))
`)
const ORPHAN_ID = orphans[0]?.id
console.log('Orphan ID:', ORPHAN_ID)

let pass = 0, fail = 0
const check = (name, cond, detail) => {
  if (cond) { console.log('  PASS:', name, detail ?? ''); pass++ }
  else { console.log('  FAIL:', name, detail ?? ''); fail++ }
}

console.log('\n[1] Happy: Lan (buddy) → Toan (tourist):')
// Pre-cleanup any leftover convs from previous runs (use .or() pattern)
const { data: preCleanup1 } = await sb.from('conversations')
  .delete()
  .or(`and(tourist_id.eq.${LAN},buddy_id.eq.${TOAN}),and(tourist_id.eq.${TOAN},buddy_id.eq.${LAN})`)
  .select('id')
const r1 = await openConv(sb, LAN, TOAN)
check('insert succeeded', r1.ok, JSON.stringify(r1))
// Cleanup via pg to avoid RLS DELETE quirks
const { Client: PgClient } = await import('pg')
const pgC = new PgClient({ connectionString: `postgresql://postgres:${process.env.SUPABASE_DB_PASSWORD}@db.pqvnjgyqbxlylawwogjv.supabase.co:5432/postgres`, ssl: { rejectUnauthorized: false } })
await pgC.connect()
await pgC.query('DELETE FROM public.conversations WHERE id = $1', [r1.id])
await pgC.end()

console.log('\n[2] Same-role: Lan (buddy) → John (buddy):')
const r2 = await openConv(sb, LAN, JOHN)
check('blocked with same-role error', !r2.ok && r2.error?.includes('both users are buddies'), JSON.stringify(r2))

console.log('\n[3] Orphan partner: Lan (buddy) → orphan tourist:')
const r3 = await openConv(sb, LAN, ORPHAN_ID)
check('blocked with orphan error (NOT FK 23503)', !r3.ok && r3.error?.includes('missing a tourist profile row'), JSON.stringify(r3))
check('no FK violation thrown', !r3.error?.includes('FK') && !r3.error?.includes('23503'), JSON.stringify(r3))

console.log('\n[4] Existing conv found: insert one, then re-open:')
const r4a = await openConv(sb, LAN, TOAN)
check('first call creates', r4a.ok && r4a.source === 'created', JSON.stringify(r4a))
const r4b = await openConv(sb, LAN, TOAN)
check('second call reuses', r4b.ok && r4b.source === 'existing' && r4b.id === r4a.id, JSON.stringify(r4b))
// Cleanup via pg
const pgC2 = new PgClient({ connectionString: `postgresql://postgres:${process.env.SUPABASE_DB_PASSWORD}@db.pqvnjgyqbxlylawwogjv.supabase.co:5432/postgres`, ssl: { rejectUnauthorized: false } })
await pgC2.connect()
await pgC2.query('DELETE FROM public.conversations WHERE id = $1', [r4a.id])
await pgC2.end()

await sb.auth.signOut()
await pg.end()

console.log(`\n=== Result: ${pass} PASS, ${fail} FAIL ===`)
process.exit(fail > 0 ? 1 : 0)
