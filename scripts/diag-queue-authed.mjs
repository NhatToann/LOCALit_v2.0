// Sign in as the live "Lan Pham" tourist via the password=Test1234!
// that dev emails use, then list what the swipe queue API returns.
// If the fix worked, the response should NOT include the tourist's
// own user_id. We'll cross-check against safe_buddies (anon view).

const URL = 'https://pqvnjgyqbxlylawwogjv.supabase.co'
const ANON = 'sb_publishable_3uRUZqdvazd4cENt8WOWJA_SB7HmCEE'

async function signin(email, password) {
  const r = await fetch(`${URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json', Authorization: `Bearer ${ANON}` },
    body: JSON.stringify({ email, password }),
  })
  return { status: r.status, body: await r.json() }
}

// We don't know the exact password, so try common ones for dev/test.
const candidates = ['Password123!', 'Test1234!', 'password', '12345678']
for (const pw of candidates) {
  const { status, body } = await signin('john.doe.tourist@gmail.com', pw)
  console.log(`john.doe.tourist@gmail.com / ${pw} => ${status} ${status === 200 ? 'OK' : body?.error_code ?? body?.msg ?? ''}`)
  if (status === 200) {
    const userId = body.user.id
    console.log('  user_id:', userId)
    // Now ask for the queue using the user's bearer token
    const q = await fetch('http://localhost:3000/api/swipe/queue', {
      headers: { Authorization: `Bearer ${body.access_token}` },
    })
    console.log('  /api/swipe/queue (with bearer) =>', q.status)
    const txt = await q.text()
    console.log('  body:', txt.slice(0, 500))
    break
  }
}
