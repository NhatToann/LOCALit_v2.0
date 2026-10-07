// Smoke for the bidirectional connection flow:
//   1. John (tourist) sends request to Lan (buddy)
//   2. Lan sees pending request (i_am_receiver)
//   3. Lan accepts → status='accepted'
//   4. Lan sends request to John → already-exists handling
//   5. Cleanup
//
// Run after 2026-11-07-connection-bidirectional.sql is applied.

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
  console.log('--- Connection bidirectional smoke ---\n')

  const [john, lan] = await Promise.all([
    signIn('john.doe@example.com', 'password123'),
    signIn('lan.pham@localit.dev', 'password123'),
  ])
  console.log(`John (tourist) = ${john.userId}`)
  console.log(`Lan  (buddy)   = ${lan.userId}\n`)

  // Cleanup from prior runs
  await john.sb.from('connections').delete().or(
    `and(requester_id.eq.${john.userId},recipient_id.eq.${lan.userId}),and(requester_id.eq.${lan.userId},recipient_id.eq.${john.userId})`,
  )

  // 1. John sends request to Lan (request goes in as tourist_id=John, buddy_id=Lan)
  const { data: req1, error: e1 } = await john.sb.from('connections').insert({
    tourist_id: john.userId,
    buddy_id: lan.userId,
    requester_id: john.userId,
    recipient_id: lan.userId,
    requester_role: 'tourist',
    recipient_role: 'buddy',
    status: 'pending',
    message: 'Hi Lan, visiting Da Nang next month.',
  }).select().single()
  assert('1. John sends connection request to Lan', !e1 && req1?.status === 'pending', e1?.message)

  // 2. Lan sees the pending request as receiver
  const { data: lanInbox, error: e2 } = await lan.sb
    .from('connections')
    .select('*')
    .eq('recipient_id', lan.userId)
    .eq('status', 'pending')
    .eq('requester_id', john.userId)
    .maybeSingle()
  assert('2. Lan sees pending request in inbox', !e2 && !!lanInbox, e2?.message)

  // 3. Lan accepts
  const { data: accepted, error: e3 } = await lan.sb
    .from('connections')
    .update({ status: 'accepted', accepted_at: new Date().toISOString() })
    .eq('id', req1.id)
    .select()
    .single()
  assert('3. Lan accepts (status=accepted)', !e3 && accepted?.status === 'accepted', e3?.message)

  // 4. John sees the accepted connection
  const { data: johnView, error: e4 } = await john.sb
    .from('connections')
    .select('*')
    .eq('id', req1.id)
    .maybeSingle()
  assert('4. John sees accepted status', !e4 && johnView?.status === 'accepted', e4?.message)

  // 5. John sends ANOTHER request — should be blocked by UNIQUE
  const { error: e5 } = await john.sb.from('connections').insert({
    tourist_id: john.userId,
    buddy_id: lan.userId,
    requester_id: john.userId,
    recipient_id: lan.userId,
    requester_role: 'tourist',
    recipient_role: 'buddy',
    status: 'pending',
  })
  assert('5. Duplicate request is rejected (unique index)', !!e5, '(no error — bad)')

  // 6. Cleanup
  const { error: e6 } = await john.sb.from('connections').delete().eq('id', req1.id)
  assert('6. Cleanup — delete accepted row', !e6, e6?.message)

  // 8. Test buddy→tourist (Lan sends to John)
  const { data: req2, error: e7 } = await lan.sb.from('connections').insert({
    tourist_id: lan.userId, // requester in the legacy slot
    buddy_id: john.userId,   // recipient in the legacy slot
    requester_id: lan.userId,
    recipient_id: john.userId,
    requester_role: 'buddy',
    recipient_role: 'tourist',
    status: 'pending',
    message: 'Hi John, I guide food tours — interested?',
  }).select().single()
  assert('7. Lan (buddy) sends request to John (tourist)', !e7 && req2, e7?.message)

  // John sees it
  const { data: johnInbox, error: e8 } = await john.sb
    .from('connections')
    .select('*')
    .eq('recipient_id', john.userId)
    .eq('status', 'pending')
    .eq('requester_id', lan.userId)
    .maybeSingle()
  assert('8. John sees pending request from Lan', !e8 && !!johnInbox, e8?.message)

  // John accepts
  const { error: e9 } = await john.sb
    .from('connections')
    .update({ status: 'accepted' })
    .eq('id', req2.id)
  assert('9. John accepts (cross-role)', !e9, e9?.message)

  // Cleanup
  await john.sb.from('connections').delete().eq('id', req2.id)

  console.log(`\n--- ${fails === 0 ? 'ALL PASS' : `${fails} FAIL`} ---`)
  process.exit(fails === 0 ? 0 : 1)
})().catch((e) => { console.error('FATAL', e.message); process.exit(1) })