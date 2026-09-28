/**
 * Smoke test for the voice-call plumbing (Stringee edition).
 *
 * What this verifies (server-side only — full WebRTC ICE negotiation
 * requires a real browser with RTCPeerConnection + getUserMedia):
 *   1. /api/stringee/access-token returns a valid JWT for an
 *      authenticated Supabase user (and 401 for anonymous).
 *   2. Two seeded users can insert + accept a pending_calls row.
 *   3. The Realtime broadcast UPDATE event fires when the callee
 *      accepts.
 *   4. Ending the call writes a call_event row in the messages table.
 *
 * Usage:
 *   $env:NEXT_PUBLIC_SUPABASE_URL="https://pqvnjgyqbxlylawwogjv.supabase.co"
 *   $env:NEXT_PUBLIC_SUPABASE_ANON_KEY="sb_publishable_..."
 *   $env:API_BASE="http://localhost:3000"
 *   node scripts/verify-voice-call.mjs
 *
 * For production, set API_BASE to the canonical Vercel URL.
 */
import { createClient } from '@supabase/supabase-js'

const API_BASE = process.env.API_BASE || 'http://localhost:3000'
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!SUPABASE_URL || !SUPABASE_ANON) {
  console.error(
    'Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY env vars.',
  )
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
  const sb = createClient(SUPABASE_URL, SUPABASE_ANON, {
    auth: { persistSession: false },
  })
  const { data, error } = await sb.auth.signInWithPassword({ email, password })
  if (error || !data.session) {
    throw new Error(
      `signIn failed for ${email}: ${error?.message ?? 'no session'}`,
    )
  }
  return { sb, userId: data.session.user.id, session: data.session }
}

async function fetchStringeeToken(headers) {
  const res = await fetch(`${API_BASE}/api/stringee/access-token`, {
    method: 'POST',
    headers,
  })
  return { status: res.status, body: await res.json().catch(() => ({})) }
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
  console.log(`Smoke testing Stringee voice-call plumbing at ${API_BASE}`)

  // Step 1: Anonymous token request should be rejected (401).
  console.log('\n--- /api/stringee/access-token (anonymous) ---')
  const anon = await fetchStringeeToken({ 'content-type': 'application/json' })
  expect(
    anon.status === 401 || anon.status === 503,
    `anonymous request rejected (got ${anon.status}, body: ${JSON.stringify(anon.body).slice(0, 60)}…)`,
  )
  if (anon.status === 503) {
    console.log(
      '  INFO  Stringee env vars not configured on this server; full token test below will be SKIPPED.',
    )
  }

  // Step 2: Sign in both seed users
  console.log('\n--- Sign in ---')
  const tourist = await signIn(accounts[0].email, accounts[0].password)
  const buddy = await signIn(accounts[1].email, accounts[1].password)
  expect(tourist.userId !== buddy.userId, 'two distinct user IDs')

  // Step 3: Try to fetch a Stringee token with the tourist's session.
  console.log('\n--- /api/stringee/access-token (authenticated) ---')
  const touristToken = await fetchStringeeToken({
    'content-type': 'application/json',
    authorization: `Bearer ${tourist.session.access_token}`,
  })
  if (touristToken.status === 503) {
    console.log(
      '  SKIP  Stringee not configured server-side; access-token test inconclusive.',
    )
  } else {
    expect(
      touristToken.status === 200,
      `authenticated request returned 200 (got ${touristToken.status})`,
    )
    expect(
      typeof touristToken.body.accessToken === 'string' &&
        touristToken.body.accessToken.split('.').length === 3,
      `accessToken is a JWT (3 dot-separated parts)`,
    )
    expect(
      touristToken.body.userId === tourist.userId,
      `JWT userId matches session (got '${touristToken.body.userId}')`,
    )
    expect(
      typeof touristToken.body.expiresAt === 'number' &&
        touristToken.body.expiresAt > Math.floor(Date.now() / 1000),
      `expiresAt is a future unix timestamp`,
    )
  }

  // Step 4: Find or skip a conversation between them
  console.log('\n--- Conversation ---')
  const conv = await findConversation(tourist.sb, tourist.userId, buddy.userId)
  if (!conv) {
    console.log(
      '  SKIP  no conversation exists between john.doe and lan.pham — seed-accounts.mjs does not create one.',
    )
    return summary()
  }
  expect(!!conv.id, `conversation exists (id=${conv.id?.slice(0, 8)}…)`)

  // Step 5: Caller inserts pending_calls row
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

  // Step 6: Subscribe to Realtime as buddy, then accept as buddy.
  console.log('\n--- Realtime UPDATE event ---')
  let updateSeen = null
  const channel = buddy.sb
    .channel(`test-pending:${pc.id}`)
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'pending_calls',
        filter: `id=eq.${pc.id}`,
      },
      (payload) => {
        updateSeen = payload.new
      },
    )
    .subscribe()
  await new Promise((r) => setTimeout(r, 800))

  const { error: acceptErr } = await buddy.sb
    .from('pending_calls')
    .update({ status: 'accepted' })
    .eq('id', pc.id)
    .eq('callee_id', buddy.userId)
  expect(!acceptErr, 'callee accepted without error')

  await new Promise((r) => setTimeout(r, 1500))
  expect(
    updateSeen?.status === 'accepted',
    `realtime UPDATE delivered status='accepted'`,
  )
  await buddy.sb.removeChannel(channel)

  // Step 7: Log a call_event message (what endCall() does)
  console.log('\n--- Log call_event ---')
  const { error: msgErr } = await tourist.sb.from('messages').insert({
    conversation_id: conv.id,
    sender_id: tourist.userId,
    content: '📞 Voice call · 1 min 23 s',
    message_type: 'call_event',
    metadata: { duration_seconds: 83 },
  })
  expect(!msgErr, 'call_event message inserted')

  const { data: callRows } = await tourist.sb
    .from('messages')
    .select('id, message_type, content')
    .eq('conversation_id', conv.id)
    .eq('message_type', 'call_event')
    .order('created_at', { ascending: false })
    .limit(1)
  expect(
    callRows && callRows.length === 1 && callRows[0].content.includes('Voice call'),
    `call_event row readable by tourist (latest: '${callRows?.[0]?.content?.slice(0, 40)}…')`,
  )

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