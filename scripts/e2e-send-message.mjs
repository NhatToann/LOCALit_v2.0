// E2E test: send a message as John to Lan, then check Lan's bell.
import { createClient } from '@supabase/supabase-js'

const URL = 'https://pqvnjgyqbxlylawwogjv.supabase.co'
const KEY = 'sb_publishable_3uRUZqdvazd4cENt8WOWJA_SB7HmCEE'

async function signIn(email, password) {
  const sb = createClient(URL, KEY, { auth: { persistSession: false } })
  const { data, error } = await sb.auth.signInWithPassword({ email, password })
  if (error || !data.session) throw new Error(`signIn ${email}: ${error?.message}`)
  return { sb, userId: data.user.id }
}

;(async () => {
  const john = await signIn('john.doe@example.com', 'password123')
  const lan = await signIn('lan.pham@localit.dev', 'password123')
  console.log(`John=${john.userId.slice(0,8)} Lan=${lan.userId.slice(0,8)}`)

  // Cleanup
  await john.sb.from('notifications').delete().eq('user_id', lan.userId)
  // Find conversation
  let { data: conv } = await john.sb.from('conversations').select('*').or(
    `and(tourist_id.eq.${john.userId},buddy_id.eq.${lan.userId}),and(tourist_id.eq.${lan.userId},buddy_id.eq.${john.userId})`,
  ).maybeSingle()
  if (!conv) {
    const ins = await john.sb.from('conversations').insert({
      tourist_id: john.userId,
      buddy_id: lan.userId,
    }).select().single()
    conv = ins.data
  }
  console.log(`Conv: ${conv.id}`)

  // Send message
  const { error: msgErr } = await john.sb.from('messages').insert({
    conversation_id: conv.id,
    sender_id: john.userId,
    content: 'E2E test message — please check your bell!',
  })
  console.log('Sent:', !msgErr, msgErr?.message)

  // Wait 500ms for trigger
  await new Promise(r => setTimeout(r, 500))

  // Check Lan's notifications
  const { data: notes, error: nErr } = await lan.sb.from('notifications')
    .select('*')
    .eq('user_id', lan.userId)
    .order('created_at', { ascending: false })
    .limit(1)
  console.log('Lan notifications:', JSON.stringify(notes?.[0], null, 2), 'err:', nErr?.message)

  process.exit(0)
})().catch(e => { console.error('FATAL', e.message); process.exit(1) })