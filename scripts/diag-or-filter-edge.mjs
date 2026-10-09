// scripts/diag-or-filter-edge.mjs
// Edge case: does PostgREST .or() with 2 and() return the right row
// when conversation exists in ONLY ONE orientation?
import { createClient } from '@supabase/supabase-js'

const URL = 'https://pqvnjgyqbxlylawwogjv.supabase.co'
const ANON = 'sb_publishable_3uRUZqdvazd4cENt8WOWJA_SB7HmCEE'
const LAN = '11111111-1111-1111-1111-111111111111'
const TOAN = 'f2df98b0-96cf-451d-9d85-5060ddc1ca01'

const sb = createClient(URL, ANON, { auth: { persistSession: false } })

await sb.auth.signInWithPassword({ email: 'lan.pham@localit.dev', password: 'password123' })

// Insert as if Toan opened chat with Lan: (TOAN=tourist, LAN=buddy)
console.log('[A] Insert (tourist=TOAN, buddy=LAN):')
const { data: c1, error: e1 } = await sb.from('conversations')
  .insert({ tourist_id: TOAN, buddy_id: LAN }).select('id').single()
console.log('  ->', { id: c1?.id, err: e1?.message })
const cid = c1?.id

// Test 1: existing check with WRONG orientation first
console.log('\n[B] Run app .or() pattern (and(LAN,TOAN) first):')
const { data: r1, error: re1 } = await sb.from('conversations')
  .select('id')
  .or(
    `and(tourist_id.eq.${LAN},buddy_id.eq.${TOAN}),and(tourist_id.eq.${TOAN},buddy_id.eq.${LAN})`,
  )
  .maybeSingle()
console.log('  ->', { found: r1?.id, err: re1?.message })

// Test 2: same .or() but reversed
console.log('\n[C] Run app .or() pattern (and(TOAN,LAN) first):')
const { data: r2, error: re2 } = await sb.from('conversations')
  .select('id')
  .or(
    `and(tourist_id.eq.${TOAN},buddy_id.eq.${LAN}),and(tourist_id.eq.${LAN},buddy_id.eq.${TOAN})`,
  )
  .maybeSingle()
console.log('  ->', { found: r2?.id, err: re2?.message })

// Test 3: maybeSingle behavior when .or() returns multiple
console.log('\n[D] Insert another (will fail due to UNIQUE, but try):')
const { data: c2, error: e2 } = await sb.from('conversations')
  .insert({ tourist_id: TOAN, buddy_id: LAN }).select('id').single()
console.log('  ->', { id: c2?.id, err: e2?.message })

// Cleanup
await sb.from('conversations').delete().eq('id', cid)
await sb.auth.signOut()
console.log('\nDone')
