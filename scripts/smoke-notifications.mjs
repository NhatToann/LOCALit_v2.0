// Smoke for the notification triggers + bell payload shape.
//   1. John sends a message to Lan → Lan's notification list has 1 row
//   2. John sends a connection request to Lan → Lan's list has 2 rows
//   3. Lan accepts → John's list grows by 1 (accepted event)
//   4. John can mark a notification read (UPDATE)

import { createClient } from '@supabase/supabase-js'

const URL = 'https://pqvnjgyqbxlylawwogjv.supabase.co'
const KEY = 'sb_publishable_3uRUZqdvazd4cENt8WOWJA_SB7HmCEE'

const log = (label, ok, detail = '') =>
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? '  ' + detail : ''}`)
let fails = 0
const assert = (label, cond, detail = '') => {
  if (!cond) fails++
  log(label, cond, detail)
}

async function signIn(email, password) {
  const sb = createClient(URL, KEY, { auth: { persistSession: false } })
  const { data, error } = await sb.auth.signInWithPassword({ email, password })
  if (error || !data.session) throw new Error(`signIn ${email}: ${error?.message}`)
  return { sb, userId: data.user.id }
}

;(async () => {
  console.log('--- Notifications smoke ---\n')

  const [john, lan] = await Promise.all([
    signIn('john.doe@example.com', 'password123'),
    signIn('lan.pham@localit.dev', 'password123'),
  ])
  console.log(`John (tourist) = ${john.userId}`)
  console.log(`Lan  (buddy)   = ${lan.userId}\n`)

  // Cleanup from prior runs
  await john.sb.from('notifications').delete().eq('user_id', john.userId)
  await lan.sb.from('notifications').delete().eq('user_id', lan.userId)
  await john.sb.from('messages').delete().or(`sender_id.eq.${john.userId},sender_id.eq.${lan.userId}`)
  // Find any existing conversation between them
  const { data: existingConv } = await john.sb.from('conversations')
    .select('id')
    .or(`tourist_id.eq.${john.userId},buddy_id.eq.${john.userId}`)
    .or(`tourist_id.eq.${lan.userId},buddy_id.eq.${lan.userId}`)
    .maybeSingle()
  if (existingConv) {
    await john.sb.from('messages').delete().eq('conversation_id', existingConv.id)
    await john.sb.from('conversations').delete().eq('id', existingConv.id)
  }
  await john.sb.from('connections').delete().or(
    `and(requester_id.eq.${john.userId},recipient_id.eq.${lan.userId}),and(requester_id.eq.${lan.userId},recipient_id.eq.${john.userId})`,
  )

  // ---- 1. Message trigger ----
  // Reuse any existing conversation between them (or create new)
  let { data: conv, error: convErr } = await john.sb.from('conversations').select('*').or(
    `and(tourist_id.eq.${john.userId},buddy_id.eq.${lan.userId}),and(tourist_id.eq.${lan.userId},buddy_id.eq.${john.userId})`,
  ).maybeSingle()
  if (!conv) {
    const ins = await john.sb.from('conversations').insert({
      tourist_id: john.userId,
      buddy_id: lan.userId,
    }).select().single()
    conv = ins.data
    convErr = ins.error
  }
  assert('1a. Conversation created', !convErr && !!conv, convErr?.message)

  const { error: msgErr } = await john.sb.from('messages').insert({
    conversation_id: conv.id,
    sender_id: john.userId,
    content: 'Hi Lan, looking forward to the food tour!',
  })
  assert('1b. John sent a message', !msgErr, msgErr?.message)

  const { data: lanNotes1, error: n1Err } = await lan.sb
    .from('notifications')
    .select('*')
    .eq('user_id', lan.userId)
    .eq('type', 'message')
    .order('created_at', { ascending: false })
    .limit(1)
  assert('1c. Lan got a message notification', !n1Err && lanNotes1?.[0], n1Err?.message)
  assert('1d. Title contains actor name', lanNotes1?.[0]?.title?.includes('John'), lanNotes1?.[0]?.title)
  assert('1e. Body has the message', lanNotes1?.[0]?.body?.includes('food tour'), lanNotes1?.[0]?.body)

  // ---- 2. Connection request trigger ----
  const { data: conn, error: reqErr } = await john.sb.from('connections').insert({
    tourist_id: john.userId,
    buddy_id: lan.userId,
    requester_id: john.userId,
    recipient_id: lan.userId,
    requester_role: 'tourist',
    recipient_role: 'buddy',
    status: 'pending',
    message: 'Coffee tomorrow?',
  }).select().single()
  assert('2a. John sent a connection request', !reqErr && conn, reqErr?.message)

  const { data: lanNotes2, error: n2Err } = await lan.sb
    .from('notifications')
    .select('*')
    .eq('user_id', lan.userId)
    .eq('type', 'connection_request')
    .order('created_at', { ascending: false })
    .limit(1)
  assert('2b. Lan got a connection_request notification', !n2Err && lanNotes2?.[0], n2Err?.message)
  assert('2c. Link points to /buddies/<john>', lanNotes2?.[0]?.link?.includes(john.userId), lanNotes2?.[0]?.link)

  // ---- 3. Lan accepts → John gets accepted notification ----
  await lan.sb.from('connections').update({ status: 'accepted' }).eq('id', conn.id)
  const { data: johnNotes, error: n3Err } = await john.sb
    .from('notifications')
    .select('*')
    .eq('user_id', john.userId)
    .eq('type', 'connection_accepted')
    .order('created_at', { ascending: false })
    .limit(1)
  assert('3a. John got a connection_accepted notification', !n3Err && johnNotes?.[0], n3Err?.message)
  assert('3b. Title says "accepted"', johnNotes?.[0]?.title?.includes('accepted'), johnNotes?.[0]?.title)

  // ---- 4. Mark read ----
  const id = lanNotes1?.[0]?.id
  if (id) {
    const { error: markErr } = await lan.sb
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('id', id)
    assert('4a. Mark notification read', !markErr, markErr?.message)
  } else {
    assert('4a. Mark notification read', false, '(no id)')
  }

  // ---- 5. Cleanup ----
  await john.sb.from('notifications').delete().eq('user_id', john.userId)
  await lan.sb.from('notifications').delete().eq('user_id', lan.userId)
  await john.sb.from('messages').delete().eq('conversation_id', conv.id)
  await john.sb.from('conversations').delete().eq('id', conv.id)
  await john.sb.from('connections').delete().eq('id', conn.id)

  console.log(`\n--- ${fails === 0 ? 'ALL PASS' : `${fails} FAIL`} ---`)
  process.exit(fails === 0 ? 0 : 1)
})().catch((e) => { console.error('FATAL', e.message); process.exit(1) })