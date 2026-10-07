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
  const john = await signIn('john.doe@example.com', 'password123')
  // John's notification inbox
  const { data: notes } = await john.sb.from('notifications')
    .select('*')
    .eq('user_id', john.userId)
    .order('created_at', { ascending: false })
    .limit(3)
  console.log('John notifications:')
  notes?.forEach(n => console.log(`  ${n.type}: ${n.title}`))
  // Confirm connection accepted
  const { data: conn } = await john.sb.from('connections')
    .select('*')
    .or(`and(requester_id.eq.${john.userId},recipient_id.eq.11111111-1111-1111-1111-111111111111),and(requester_id.eq.11111111-1111-1111-1111-111111111111,recipient_id.eq.${john.userId})`)
    .maybeSingle()
  console.log('Connection status:', conn?.status)
  process.exit(0)
})().catch(e => { console.error('FATAL', e.message); process.exit(1) })