// Sign in as a known tourist account, then call the swipe APIs end-to-end
const URL = 'https://pqvnjgyqbxlylawwogjv.supabase.co'
const ANON = 'sb_publishable_3uRUZqdvazd4cENt8WOWJA_SB7HmCEE'

const headers = { apikey: ANON, 'Content-Type': 'application/json' }

const email = 'john.doe.tourist@gmail.com'
const password = 'Password123!'

// 1. Sign in
const signin = await fetch(`${URL}/auth/v1/token?grant_type=password`, {
  method: 'POST',
  headers: { ...headers, Authorization: `Bearer ${ANON}` },
  body: JSON.stringify({ email, password }),
})
const signinBody = await signin.json()
if (!signin.ok) {
  console.log('signin failed:', signin.status, signinBody)
  process.exit(1)
}
const token = signinBody.access_token
const userId = signinBody.user.id
console.log('signed in as', email, '->', userId)

const authHeaders = { ...headers, Authorization: `Bearer ${token}` }

// 2. GET /api/swipe/queue via localhost
const q = await fetch('http://localhost:3000/api/swipe/queue', {
  headers: { Cookie: '' /* will be set by Next, so this is a no-op; need session cookie */ },
})
console.log('queue HTTP', q.status, '->', (await q.text()).slice(0, 300))

// 3. Verify the table is readable to the authenticated role directly
const own = await fetch(`${URL}/rest/v1/swipes?select=id,target_id,direction&swiper_id=eq.${userId}&limit=5`, {
  headers: authHeaders,
})
console.log('own swipes HTTP', own.status, '->', (await own.text()).slice(0, 300))

const matches = await fetch(`${URL}/rest/v1/matches?select=id,tourist_id,buddy_id&or=(tourist_id.eq.${userId},buddy_id.eq.${userId})&limit=5`, {
  headers: authHeaders,
})
console.log('my matches HTTP', matches.status, '->', (await matches.text()).slice(0, 300))
