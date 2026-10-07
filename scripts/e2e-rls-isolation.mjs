// RLS check: user A cannot read user B notifications
import { createClient } from '@supabase/supabase-js'
const URL = 'https://pqvnjgyqbxlylawwogjv.supabase.co'
const KEY = 'sb_publishable_3uRUZqdvazd4cENt8WOWJA_SB7HmCEE'

async function signIn(email, password) {
  const sb = createClient(URL, KEY, { auth: { persistSession: false } })
  const { data, error } = await sb.auth.signInWithPassword({ email, password })
  if (error) throw error
  return { sb, userId: data.user.id }
}

;(async () => {
  const lan = await signIn('lan.pham@localit.dev', 'password123')
  const JOHN = 'aaaa1111-1111-1111-1111-111111111111'
  // Lan tries to read John's notifications
  const { data, error } = await lan.sb
    .from('notifications')
    .select('*')
    .eq('user_id', JOHN)
    .limit(5)
  console.log('Lan reading John notifications:')
  console.log('  rows:', data?.length, 'expected: 0')
  if (data && data.length > 0) {
    console.log('  LEAK:', JSON.stringify(data, null, 2))
    console.log('FAIL — RLS broken, Lan can read John notifications!')
    process.exit(1)
  }
  console.log('PASS — RLS properly scoped to own notifications')
  process.exit(0)
})().catch(e => { console.error('FATAL', e.message); process.exit(1) })