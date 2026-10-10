// Test: does /login?switch=1 return 200 (not 307) when a session cookie is present?
const SUPA = 'https://pqvnjgyqbxlylawwogjv.supabase.co'
const ANON = 'sb_publishable_3uRUZqdvazd4cENt8WOWJA_SB7HmCEE'
const BASE = 'https://localit-nhattoann.vercel.app'

const main = async () => {
  // Sign in to get a real session
  const r = await fetch(`${SUPA}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON, 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'lan.pham@localit.dev', password: 'password123' }),
  })
  const j = await r.json()
  if (!j.access_token) throw new Error('login failed: ' + JSON.stringify(j).slice(0, 200))

  // Build the cookie the SSR client would set
  const session = {
    access_token: j.access_token,
    token_type: j.token_type,
    expires_in: j.expires_in,
    expires_at: j.expires_at,
    refresh_token: j.refresh_token,
    user: j.user,
  }
  const cookieValue = 'base64-' + btoa(unescape(encodeURIComponent(JSON.stringify(session))))
  const cookie = `sb-pqvnjgyqbxlylawwogjv-auth-token=${cookieValue}`

  for (const path of ['/login', '/login?switch=1']) {
    const res = await fetch(`${BASE}${path}`, {
      headers: { cookie },
      redirect: 'manual',
    })
    console.log(`${path.padEnd(18)} -> ${res.status} ${res.headers.get('location') ?? '(no redirect)'}`)
  }

  // Also test whether middleware sees the session at all
  const res2 = await fetch(`${BASE}/dashboard`, { headers: { cookie }, redirect: 'manual' })
  console.log(`/dashboard        -> ${res2.status} ${res2.headers.get('location') ?? '(ok)'}`)
}

main().catch(e => { console.error(e); process.exit(1) })