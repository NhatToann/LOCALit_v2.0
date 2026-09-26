// End-to-end smoke test of the chat-INSERT permission fix using the
// Supabase JS SDK with the published anon key + a real authenticated
// session. This proves the `permission denied for table messages` issue
// from QA Flow E is resolved without any code changes.

import { createClient } from '@supabase/supabase-js'

const URL = 'https://pqvnjgyqbxlylawwogjv.supabase.co'
const ANON = 'sb_publishable_3uRUZqdvazd4cENt8WOWJA_SB7HmCEE'

const sb = createClient(URL, ANON, { auth: { persistSession: false } })

async function main() {
  const email = `qa-chat-${Date.now()}@localit-test.dev`
  const pw = 'password123'

  // 1. Sign up
  const { error: signErr } = await sb.auth.signUp({
    email,
    password: pw,
    options: { data: { full_name: 'Chat Smoke Test', role: 'tourist' } },
  })
  if (signErr && !signErr.message.includes('already')) {
    console.error('signUp failed:', signErr.message)
    process.exit(1)
  }

  // 2. Sign in
  const { error: siErr } = await sb.auth.signInWithPassword({ email, password: pw })
  if (siErr) {
    console.error('signIn failed:', siErr.message)
    process.exit(1)
  }
  const { data: { user } } = await sb.auth.getUser()
  if (!user) { console.error('no user'); process.exit(1) }
  console.log('Logged in as', user.id)

  // 3. Find or create a conversation with seed buddy
  const buddyId = '11111111-1111-1111-1111-111111111111' // Lan Pham (seed)
  const { data: existing } = await sb
    .from('conversations')
    .select('id')
    .eq('tourist_id', user.id)
    .eq('buddy_id', buddyId)
    .maybeSingle()

  let convoId = existing?.id
  if (!convoId) {
    const { data: created, error: cErr } = await sb
      .from('conversations')
      .insert({ tourist_id: user.id, buddy_id: buddyId })
      .select('id')
      .single()
    if (cErr) {
      console.error('create conversation failed:', cErr.message)
      process.exit(1)
    }
    convoId = created.id
  }
  console.log('Conversation:', convoId)

  // 4. THE BUG: insert a message as authenticated user
  const probe = `Smoke test message @ ${new Date().toISOString()}`
  const { error: mErr, data: msg } = await sb
    .from('messages')
    .insert({ conversation_id: convoId, sender_id: user.id, content: probe })
    .select('id, content, created_at')
    .single()

  if (mErr) {
    console.error('INSERT message failed:', mErr.message)
    process.exit(1)
  }
  console.log('Message inserted:', msg.id, msg.content)

  // 5. Confirm we can read it back
  const { data: got, error: gErr } = await sb
    .from('messages')
    .select('id, content, created_at')
    .eq('id', msg.id)
    .single()
  if (gErr) { console.error('readback failed:', gErr.message); process.exit(1) }
  console.log('Readback OK:', got.content)

  // 6. Cleanup
  await sb.from('messages').delete().eq('id', msg.id)
  await sb.from('conversations').delete().eq('id', convoId)
  console.log('✓ Chat permission denied bug is FIXED — authenticated users can send + read messages.')
}

main().catch(e => { console.error(e); process.exit(1) })
