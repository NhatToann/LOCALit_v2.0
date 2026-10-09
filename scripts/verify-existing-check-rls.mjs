// scripts/verify-existing-check-rls.mjs
// Test: when authenticated as Lan and there's an existing conversation
// between Lan (buddy) and Toan (tourist), does the .or() existing-check
// return the row, OR does RLS block it?
import { createClient } from '@supabase/supabase-js'

const URL = 'https://pqvnjgyqbxlylawwogjv.supabase.co'
const ANON = 'sb_publishable_3uRUZqdvazd4cENt8WOWJA_SB7HmCEE'
const LAN = '11111111-1111-1111-1111-111111111111'
const TOAN = 'f2df98b0-96cf-451d-9d85-5060ddc1ca01'

const sb = createClient(URL, ANON, { auth: { persistSession: false } })

console.log('[1] Sign in as Lan...')
const { error: signErr } = await sb.auth.signInWithPassword({
  email: 'lan.pham@localit.dev', password: 'password123',
})
if (signErr) { console.log('  FAIL:', signErr.message); process.exit(1) }
console.log('  OK')

console.log('\n[2] Insert conversation (tourist=TOAN, buddy=LAN) — toan opens chat with lan:')
const { data: ins, error: insErr } = await sb.from('conversations')
  .insert({ tourist_id: TOAN, buddy_id: LAN })
  .select('id')
  .single()
console.log('  result:', { id: ins?.id, error: insErr?.message })

console.log('\n[3] Now Lan (signed in) opens chat with Toan — run the EXISTING CHECK app uses:')
const { data: existing, error: checkErr } = await sb.from('conversations')
  .select('id')
  .or(
    `and(tourist_id.eq.${LAN},buddy_id.eq.${TOAN}),and(tourist_id.eq.${TOAN},buddy_id.eq.${LAN})`,
  )
  .maybeSingle()
console.log('  existing:', existing)
console.log('  error:', checkErr?.message ?? 'none')

console.log('\n[4] Now Lan tries to insert (tourist=LAN, buddy=TOAN) — simulating app code WITHOUT existing check:')
const { data: bad, error: badErr } = await sb.from('conversations')
  .insert({ tourist_id: LAN, buddy_id: TOAN })
  .select('id')
  .single()
console.log('  result:', { id: bad?.id, error: badErr?.message, code: badErr?.code, status: badErr?.status })

console.log('\n[5] Cleanup:')
const { error: cleanupErr } = await sb.from('conversations')
  .delete()
  .or(
    `and(tourist_id.eq.${LAN},buddy_id.eq.${TOAN}),and(tourist_id.eq.${TOAN},buddy_id.eq.${LAN})`,
  )
console.log('  result:', { error: cleanupErr?.message ?? 'OK' })

await sb.auth.signOut()
console.log('\n=== Done ===')
