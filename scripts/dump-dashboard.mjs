import { createClient } from '@supabase/supabase-js'

const URL = 'https://pqvnjgyqbxlylawwogjv.supabase.co'
const ANON = 'sb_publishable_3uRUZqdvazd4cENt8WOWJA_SB7HmCEE'
const APP = 'https://localit-vn.vercel.app'

function toCookieValue(jsonSession) {
  const json = JSON.stringify(jsonSession)
  const base64url = Buffer.from(json, 'utf8')
    .toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
  return 'base64-' + base64url
}

async function login(email, password) {
  const sb = createClient(URL, ANON, { auth: { persistSession: false } })
  const r = await sb.auth.signInWithPassword({ email, password })
  if (r.error) throw r.error
  const s = r.data.session
  return `sb-pqvnjgyqbxlylawwogjv-auth-token=${toCookieValue({
    access_token: s.access_token, refresh_token: s.refresh_token,
    provider_token: null, provider_refresh_token: null, user: s.user,
    expires_at: s.expires_at, expires_in: s.expires_in, token_type: 'bearer',
  })}`
}

async function main() {
  const c = await login('john.doe@example.com', 'password123')
  const r = await fetch(APP + '/tourist/dashboard', {
    headers: { cookie: c, 'user-agent': 'Mozilla/5.0' },
    redirect: 'manual',
  })
  const body = await r.text()
  console.log('HTTP', r.status, 'len=', body.length)
  console.log('\n=== first 2000 chars ===')
  console.log(body.slice(0, 2000))
  console.log('\n=== 2000-4000 ===')
  console.log(body.slice(2000, 4000))
  console.log('\n=== 4000-6000 ===')
  console.log(body.slice(4000, 6000))
  console.log('\n=== last 2000 chars ===')
  console.log(body.slice(-2000))
}

main().catch(e => { console.error(e); process.exit(1) })
