// scripts/verify-rls-profile-read.mjs
// Test: can an authenticated user (Lan) read profile.role of another user (John)?
// This is critical because my fix queries profiles.role for the partner.
// If RLS blocks, partnerRole is null → my fix returns "unable to resolve roles"
// which is BETTER than FK violation but still blocks legitimate use cases.

import { createClient } from '@supabase/supabase-js'

const URL = 'https://pqvnjgyqbxlylawwogjv.supabase.co'
const ANON = 'sb_publishable_3uRUZqdvazd4cENt8WOWJA_SB7HmCEE'

const LAN_EMAIL = 'lan.pham@localit.dev'
const LAN_PASS = 'password123'
const JOHN_ID = 'aaaa1111-1111-1111-1111-111111111111'
const TOAN_ID = 'f2df98b0-96cf-451d-9d85-5060ddc1ca01'

const sb = createClient(URL, ANON, { auth: { persistSession: false } })

console.log('[1] Sign in as Lan (buddy)...')
const { data: signIn, error: signErr } = await sb.auth.signInWithPassword({
  email: LAN_EMAIL,
  password: LAN_PASS,
})
if (signErr) { console.log('  FAIL sign-in:', signErr.message); process.exit(1) }
console.log('  OK, user.id =', signIn.user.id)

console.log('\n[2] Read partner profile.role for John (buddy):')
const { data: johnProf, error: johnErr } = await sb
  .from('profiles')
  .select('role')
  .eq('id', JOHN_ID)
  .maybeSingle()
console.log('  result:', { data: johnProf, error: johnErr?.message })

console.log('\n[3] Read partner profile.role for Toan (tourist):')
const { data: toanProf, error: toanErr } = await sb
  .from('profiles')
  .select('role')
  .eq('id', TOAN_ID)
  .maybeSingle()
console.log('  result:', { data: toanProf, error: toanErr?.message })

console.log('\n[4] Read own profile.role:')
const { data: myProf, error: myErr } = await sb
  .from('profiles')
  .select('role')
  .eq('id', signIn.user.id)
  .maybeSingle()
console.log('  result:', { data: myProf, error: myErr?.message })

// Sign out
await sb.auth.signOut()
console.log('\n=== RLS profile read test complete ===')
