// Confirm canonical domain serves new dashboard by:
//   1. POST to /api/auth/signup with the working localit-test.dev seed
//      (the previous Seed tourists may have been QA-created). Instead, log
//      in via the Next.js app's API route which sets SSR cookies properly.
//   2. Then fetch /tourist/dashboard with the cookies.
//
// Actually simpler: use the browser's localStorage approach by using the
// @supabase/supabase-js client to get a session, then plant the cookie in
// the same SSR format the @supabase/ssr helper uses.
//
// For SSR cookies, the cookie value is: base64(JSON.stringify(session))

const APP_URL = 'https://localit-vn.vercel.app'
const SB_URL = 'https://pqvnjgyqbxlylawwogjv.supabase.co'
const SB_ANON = 'sb_publishable_3uRUZqdvazd4cENt8WOWJA_SB7HmCEE'

function toBase64Url(str) {
  return Buffer.from(str, 'utf8')
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
}

async function main() {
  // Get GoTrue session
  const r = await fetch(`${SB_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: SB_ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'john.doe@example.com', password: 'password123' }),
  })
  if (!r.ok) throw new Error(`GoTrue ${r.status}: ${await r.text()}`)
  const session = await r.json()

  // Try multiple cookie name patterns used by @supabase/ssr
  const candidates = [
    'sb-pqvnjgyqbxlylawwogjv-auth-token',
    'pqvnjgyqbxlylawwogjv-auth-token',
    'sb-access-token',
    'sb-refresh-token',
    'supabase-auth-token',
  ]

  const cookiePayload = JSON.stringify({
    access_token: session.access_token,
    token_type: 'bearer',
    expires_in: session.expires_in,
    expires_at: session.expires_at,
    refresh_token: session.refresh_token,
    user: session.user,
  })
  const cookieValue = toBase64Url(cookiePayload)

  for (const name of candidates) {
    const cookie = `${name}=${encodeURIComponent(cookieValue)}`
    const res = await fetch(`${APP_URL}/tourist/dashboard`, {
      headers: { cookie, 'user-agent': 'LOCALitDeployCheck/1.0' },
      redirect: 'manual',
    })
    const loc = res.headers.get('location')
    const ok = res.status === 200
    console.log(`  ${ok ? '✓' : '✗'}  ${name.padEnd(40)} HTTP ${res.status}  ${loc ? '→ ' + loc : ''}`)
  }

  // Also check raw HTML for the new copy if a valid session is found.
  // Let's print the homepage HTML to see what is currently served.
  console.log('\n--- Homepage HTML markers ---')
  const homeRes = await fetch(`${APP_URL}/`)
  const home = await homeRes.text()
  const markers = [
    'Contact Us',
    'Feedback',
    'mail to:support',
    'mailto:support',
    'hỗ trợ',
  ]
  for (const m of markers) {
    console.log(`  ${home.includes(m) ? '✓' : '✗'}  "${m}"`)
  }
}

main().catch(e => { console.error('FAIL:', e.message); process.exit(1) })
