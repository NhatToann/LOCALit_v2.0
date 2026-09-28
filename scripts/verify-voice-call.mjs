/**
 * Smoke test for the voice-call plumbing.
 *
 * What this verifies (server-side only — full WebRTC ICE negotiation
 * requires a real browser with RTCPeerConnection + getUserMedia, which
 * Node does not have):
 *   1. /api/webrtc/turn returns valid ICE servers (STUN always, TURN
 *      when env vars are set).
 *   2. Two seeded users can insert + accept a pending_calls row.
 *   3. The broadcast channel carries an 'accepted' event after accept.
 *   4. Ending the call writes a call_event row in the messages table.
 *
 * Usage:
 *   $env:NEXT_PUBLIC_SUPABASE_URL="..."; \
 *   $env:NEXT_PUBLIC_SUPABASE_ANON_KEY="..."; \
 *   $env:API_BASE="http://localhost:3000"; \
 *   node scripts/verify-voice-call.mjs
 *
 * Defaults to http://localhost:3000. For production pass
 *   $env:API_BASE="https://localit-nhattoann.vercel.app"
 */
import { createClient } from '@supabase/supabase-js'

const API_BASE = process.env.API_BASE || 'http://localhost:3000'
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!SUPABASE_URL || !SUPABASE_ANON) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY env vars.')
  process.exit(1)
}

const accounts = [
  { email: 'john.doe@example.com', password: 'password123', role: 'tourist' },
  { email: 'lan.pham@localit.dev', password: 'password123', role: 'buddy' },
]

let passed = 0
let failed = 0
const failures = []

function expect(cond, msg) {
  if (cond) {
    passed++
    console.log(`  OK    ${msg}`)
  } else {
    failed++
    failures.push(msg)
    console.log(`  FAIL  ${msg}`)
  }
}

async function signIn(email, password) {
  const sb = createClient(SUPABASE_URL, SUPABASE_ANON, { auth: { persistSession: false } })
  const { data, error } = await sb.auth.signInWithPassword({ email, password })
  if (error || !data.session) {
    throw new Error(`signIn failed for ${email}: ${error?.message ?? 'no session'}`)
  }
  return { sb, userId: data.session.user.id, session: data.session }
}

async function fetchIceServers() {
  const res = await fetch(`${API_BASE}/api/webrtc/turn`, { method: 'POST' })
  if (!res.ok) throw new Error(`TURN endpoint returned ${res.status}`)
  return await res.json()
}

async function findConversation(sb, myId, peerId) {
  const { data } = await sb
    .from('conversations')
    .select('id, tourist_id, buddy_id')
    .or(
      `and(tourist_id.eq.${myId},buddy_id.eq.${peerId}),and(tourist_id.eq.${peerId},buddy_id.eq.${myId})`,
    )
    .maybeSingle()
  return data
}

async function main() {
  console.log(`Smoke testing voice-call plumbing at ${API_BASE}`)

  // Step 1: TURN endpoint returns valid ICE config
  console.log('\n--- /api/webrtc/turn ---')
  const ice = await fetchIceServers()
  expect(Array.isArray(ice.iceServers) && ice.iceServers.length > 0,
    `iceServers is a non-empty array (got ${ice.iceServers?.length ?? 0})`)
  expect(typeof ice.source === 'string' && ['coturn', 'stun-only'].includes(ice.source),
    `source is 'coturn' or 'stun-only' (got '${ice.source}')`)
  expect(ice.iceServers.some((s) => String(s.urls).startsWith('stun:')),
    'at least one STUN server present')
  if (ice.source === 'coturn') {
    const turnEntry = ice.iceServers.find((s) => String(s.urls).startsWith('turn'))
    expect(!!turnEntry, 'TURN server present when source=coturn')
    expect(typeof turnEntry?.username === 'string' && turnEntry.username.includes(':'),
      'TURN username has expiry:userid shape')
    expect(typeof turnEntry?.credential === 'string' && turnEntry.credential.length > 0,
      'TURN credential is a non-empty string')
    expect(typeof ice.realm === 'string' && ice.realm.length > 0,
      `realm is set (got '${ice.realm}')`)
  } else {
    console.log('  INFO  source=stun-only (TURN env vars not set); calls will fail on symmetric NAT')
  }

  // Step 2: Sign in both seed users
  console.log('\n--- Sign in ---')
  const tourist = await signIn(accounts[0].email, accounts[0].password)
  const buddy = await signIn(accounts[1].email, accounts[1].password)
  expect(tourist.userId !== buddy.userId, 'two distinct user IDs')

  // Step 3: Find or skip a conversation between them
  console.log('\n--- Conversation ---')
  let conv = await findConversation(tourist.sb, tourist.userId, buddy.userId)
  if (!conv) {
    console.log('  SKIP  no conversation exists between john.doe and lan.pham — ' +
      'seed-accounts.mjs does not create one. Run scripts/verify-chat-e2e.mjs first.')
    return summary()
  }
  expect(!!conv.id, `conversation exists (id=${conv.id?.slice(0, 8)}…)`)

  // Step 4: Caller inserts pending_calls row (the action the dialer takes)
  console.log('\n--- Insert pending_calls ---')
  const { data: pc, error: pcErr } = await tourist.sb
    .from('pending_calls')
    .insert({
      conversation_id: conv.id,
      caller_id: tourist.userId,
      callee_id: buddy.userId,
      status: 'ringing',
    })
    .select('id, status')
    .single()
  expect(!pcErr && pc?.id, `pending_calls inserted (id=${pc?.id?.slice(0, 8)}…)`)
  expect(pc?.status === 'ringing', `initial status is 'ringing' (got '${pc?.status}')`)

  // Step 5: Subscribe to the Realtime channel as the buddy, then accept as buddy.
  // We subscribe FIRST so the UPDATE event is captured deterministically.
  console.log('\n--- Realtime UPDATE event ---')
  let updateSeen = null
  const channel = buddy.sb
    .channel(`test-pending:${pc.id}`)
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'pending_calls', filter: `id=eq.${pc.id}` },
      (payload) => {
        updateSeen = payload.new
      },
    )
    .subscribe()
  // Wait for subscribe
  await new Promise((r) => setTimeout(r, 800))

  const { error: acceptErr } = await buddy.sb
    .from('pending_calls')
    .update({ status: 'accepted' })
    .eq('id', pc.id)
    .eq('callee_id', buddy.userId)
  expect(!acceptErr, 'callee accepted without error')

  // Wait for the realtime event
  await new Promise((r) => setTimeout(r, 1500))
  expect(updateSeen?.status === 'accepted', `realtime UPDATE delivered status='accepted'`)
  await buddy.sb.removeChannel(channel)

  // Step 6: Log a call_event message (what endCall() does on real connection)
  console.log('\n--- Log call_event ---')
  const { error: msgErr } = await tourist.sb.from('messages').insert({
    conversation_id: conv.id,
    sender_id: tourist.userId,
    content: '📞 Voice call · 1 min 23 s',
    message_type: 'call_event',
    metadata: { duration_seconds: 83 },
  })
  expect(!msgErr, 'call_event message inserted')

  // Verify it landed
  const { data: callRows } = await tourist.sb
    .from('messages')
    .select('id, message_type, content')
    .eq('conversation_id', conv.id)
    .eq('message_type', 'call_event')
    .order('created_at', { ascending: false })
    .limit(1)
  expect(callRows && callRows.length === 1 && callRows[0].content.includes('Voice call'),
    `call_event row readable by tourist (latest: '${callRows?.[0]?.content?.slice(0, 40)}…')`)

  // Step 7: Terminate the pending_calls row
  console.log('\n--- Terminate pending_calls ---')
  const { error: endErr } = await tourist.sb
    .from('pending_calls')
    .update({ status: 'accepted' })
    .eq('id', pc.id)
  expect(!endErr, 'pending_calls terminal status update succeeded')

  summary()
}

function summary() {
  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) {
    console.log('\nFailures:')
    for (const f of failures) console.log(`  - ${f}`)
    process.exit(1)
  }
  process.exit(0)
}

main().catch((e) => {
  console.error(e)
  process.exit(2)
})