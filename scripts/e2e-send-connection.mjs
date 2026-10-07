import { createClient } from '@supabase/supabase-js'
const URL = 'https://pqvnjgyqbxlylawwogjv.supabase.co'
const KEY = 'sb_publishable_3uRUZqdvazd4cENt8WOWJA_SB7HmCEE'

async function signIn(email, password) {
  const sb = createClient(URL, KEY, { auth: { persistSession: false } })
  const { data, error } = await sb.auth.signInWithPassword({ email, password })
  if (error) throw new Error(error.message)
  return { sb, userId: data.user.id }
}

;(async () => {
  const john = await signIn('john.doe@example.com', 'password123')
  const lan = await signIn('lan.pham@localit.dev', 'password123')
  // Clean existing connection + notification
  await john.sb.from('connections').delete().or(
    `and(requester_id.eq.${john.userId},recipient_id.eq.${lan.userId}),and(requester_id.eq.${lan.userId},recipient_id.eq.${john.userId})`,
  )
  await john.sb.from('notifications').delete().eq('user_id', lan.userId)

  // Send connection request
  const { data: conn, error: connErr } = await john.sb.from('connections').insert({
    tourist_id: john.userId,
    buddy_id: lan.userId,
    requester_id: john.userId,
    recipient_id: lan.userId,
    requester_role: 'tourist',
    recipient_role: 'buddy',
    status: 'pending',
    message: 'E2E test — would love to chat!',
  }).select().single()
  console.log('Connection:', conn?.id, 'err:', connErr?.message)

  // Wait for trigger
  await new Promise(r => setTimeout(r, 500))

  const { data: notes } = await lan.sb.from('notifications')
    .select('*')
    .eq('user_id', lan.userId)
    .order('created_at', { ascending: false })
    .limit(2)
  console.log('Lan notifications (most recent 2):')
  notes?.forEach(n => console.log(`  ${n.type}: ${n.title} | body: ${n.body?.slice(0,40)}`))

  process.exit(0)
})().catch(e => { console.error('FATAL', e.message); process.exit(1) })