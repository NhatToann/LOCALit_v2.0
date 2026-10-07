// RLS check: anon user cannot read notifications
import { createClient } from '@supabase/supabase-js'
const URL = 'https://pqvnjgyqbxlylawwogjv.supabase.co'
const KEY = 'sb_publishable_3uRUZqdvazd4cENt8WOWJA_SB7HmCEE'

const sb = createClient(URL, KEY, { auth: { persistSession: false } })

;(async () => {
  // Anon: try to read Lan notifications
  const { data, error } = await sb
    .from('notifications')
    .select('*')
    .eq('user_id', '11111111-1111-1111-1111-111111111111')
    .limit(1)
  console.log('Anon can read Lans notifications?')
  console.log('  rows:', data?.length, 'error:', error?.message, 'code:', error?.code)
  // Should fail with 42501 permission denied
  const ok = (error?.code === '42501') || (data && data.length === 0)
  console.log(ok ? 'PASS' : 'FAIL — anon leaked notifications!')
  process.exit(ok ? 0 : 1)
})()