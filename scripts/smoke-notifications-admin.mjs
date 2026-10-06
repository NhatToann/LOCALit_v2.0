// Service-role smoke for notifications (bypass RLS for verification).
//   Goal: prove the DB triggers fire + rows land in the right shape.

import { createClient } from '@supabase/supabase-js'

const URL = 'https://pqvnjgyqbxlylawwogjv.supabase.co'
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE
if (!SERVICE_KEY) { console.error('Missing SUPABASE_SERVICE_ROLE'); process.exit(1) }

const log = (label, ok, detail = '') =>
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? '  ' + detail : ''}`)
let fails = 0
const assert = (label, cond, detail = '') => {
  if (!cond) fails++
  log(label, cond, detail)
}

const admin = createClient(URL, SERVICE_KEY, { auth: { persistSession: false } })

;(async () => {
  console.log('--- Notifications smoke (admin) ---\n')

  const JOHN = 'aaaa1111-1111-1111-1111-111111111111'
  const LAN = '11111111-1111-1111-1111-111111111111'

  // Clean
  await admin.from('notifications').delete().in('user_id', [JOHN, LAN])
  const { data: conv } = await admin.from('conversations').insert({
    tourist_id: JOHN,
    buddy_id: LAN,
  }).select().single()
  assert('1a. Conversation created', !!conv)

  // 1. Message trigger
  await admin.from('messages').insert({
    conversation_id: conv.id,
    sender_id: JOHN,
    content: 'Hi Lan, looking forward to the food tour!',
  })
  const { data: msgNote } = await admin.from('notifications')
    .select('*')
    .eq('user_id', LAN)
    .eq('type', 'message')
    .order('created_at', { ascending: false }).limit(1)
  assert('1b. Lan got message notification', !!msgNote?.[0], JSON.stringify(msgNote?.[0]))
  assert('1c. Title contains actor name', msgNote?.[0]?.title?.includes('John'), msgNote?.[0]?.title)
  assert('1d. Body has message', msgNote?.[0]?.body?.includes('food tour'), msgNote?.[0]?.body)
  assert('1e. Link to /chat?with=<john>', msgNote?.[0]?.link === `/chat?with=${JOHN}`, msgNote?.[0]?.link)

  // 2. Connection request trigger
  const { data: conn } = await admin.from('connections').insert({
    tourist_id: JOHN,
    buddy_id: LAN,
    requester_id: JOHN,
    recipient_id: LAN,
    requester_role: 'tourist',
    recipient_role: 'buddy',
    status: 'pending',
    message: 'Coffee tomorrow?',
  }).select().single()
  assert('2a. Connection created', !!conn)

  const { data: reqNote } = await admin.from('notifications')
    .select('*')
    .eq('user_id', LAN)
    .eq('type', 'connection_request')
    .order('created_at', { ascending: false }).limit(1)
  assert('2b. Lan got connection_request notification', !!reqNote?.[0])
  assert('2c. Link to /buddies/<john>', reqNote?.[0]?.link === `/buddies/${JOHN}`, reqNote?.[0]?.link)

  // 3. Lan accepts → John gets accepted notification
  await admin.from('connections').update({ status: 'accepted' }).eq('id', conn.id)
  const { data: accNote } = await admin.from('notifications')
    .select('*')
    .eq('user_id', JOHN)
    .eq('type', 'connection_accepted')
    .order('created_at', { ascending: false }).limit(1)
  assert('3a. John got accepted notification', !!accNote?.[0], JSON.stringify(accNote?.[0]))
  assert('3b. Title contains "accepted"', accNote?.[0]?.title?.includes('accepted'), accNote?.[0]?.title)

  // 4. Mark read
  if (msgNote?.[0]) {
    const { error: e } = await admin.from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('id', msgNote[0].id)
    assert('4a. Mark read', !e, e?.message)
  }

  // Cleanup
  await admin.from('notifications').delete().in('user_id', [JOHN, LAN])
  await admin.from('messages').delete().eq('conversation_id', conv.id)
  await admin.from('conversations').delete().eq('id', conv.id)
  await admin.from('connections').delete().eq('id', conn.id)

  console.log(`\n--- ${fails === 0 ? 'ALL PASS' : `${fails} FAIL`} ---`)
  process.exit(fails === 0 ? 0 : 1)
})().catch((e) => { console.error('FATAL', e.message); process.exit(1) })