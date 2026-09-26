// End-to-end verification of the chat-INSERT fix using the actual
// https://localit-vn.vercel.app production deployment + a real signed-in
// tourist session, by hitting Supabase's PostgREST API directly (the same
// surface the chat UI uses).

const URL = 'https://pqvnjgyqbxlylawwogjv.supabase.co'

async function getSession(email, password) {
  const res = await fetch(`${URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {
      'apikey': 'sb_publishable_3uRUZqdvazd4cENt8WOWJA_SB7HmCEE',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, password }),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`signIn ${res.status}: ${body}`)
  }
  const j = await res.json()
  return { token: j.access_token, userId: j.user.id }
}

async function main() {
  const { token, userId } = await getSession('john.doe@example.com', 'password123')
  console.log('Signed in as', userId)

  // Find or create conversation with seed buddy (Lan Pham)
  const buddyId = '11111111-1111-1111-1111-111111111111'
  let convoId
  const listRes = await fetch(
    `${URL}/rest/v1/conversations?select=id&tourist_id=eq.${userId}&buddy_id=eq.${buddyId}&limit=1`,
    { headers: { apikey: 'sb_publishable_3uRUZqdvazd4cENt8WOWJA_SB7HmCEE', Authorization: `Bearer ${token}` } }
  )
  const listJson = await listRes.json()
  if (Array.isArray(listJson) && listJson.length > 0) {
    convoId = listJson[0].id
  } else {
    const createRes = await fetch(`${URL}/rest/v1/conversations`, {
      method: 'POST',
      headers: {
        apikey: 'sb_publishable_3uRUZqdvazd4cENt8WOWJA_SB7HmCEE',
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify({ tourist_id: userId, buddy_id: buddyId }),
    })
    const createJson = await createRes.json()
    convoId = createJson[0].id
  }
  console.log('Conversation:', convoId)

  // THE TEST: insert a message — this was failing with "permission denied for table messages"
  const probe = `verify-chat-grant-pg.mjs @ ${new Date().toISOString()}`
  const insRes = await fetch(`${URL}/rest/v1/messages`, {
    method: 'POST',
    headers: {
      apikey: 'sb_publishable_3uRUZqdvazd4cENt8WOWJA_SB7HmCEE',
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify({
      conversation_id: convoId,
      sender_id: userId,
      content: probe,
    }),
  })

  if (!insRes.ok) {
    const body = await insRes.text()
    console.error('INSERT message FAILED:', insRes.status, body)
    process.exit(1)
  }
  const inserted = await insRes.json()
  const msgId = inserted[0].id
  console.log('✓ Message INSERT OK:', msgId, inserted[0].content)

  // Cleanup
  await fetch(`${URL}/rest/v1/messages?id=eq.${msgId}`, {
    method: 'DELETE',
    headers: {
      apikey: 'sb_publishable_3uRUZqdvazd4cENt8WOWJA_SB7HmCEE',
      Authorization: `Bearer ${token}`,
    },
  })
  console.log('✓ Cleaned up.')
  console.log('=== FLOW E: PASS — chat send works after grant fix. ===')
}

main().catch(e => { console.error('FAIL:', e.message); process.exit(1) })
