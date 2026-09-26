// Use @supabase/supabase-js to do a real signInWithPassword, then dump the
// cookies that the SDK writes so we know the exact cookie name + shape that
// @supabase/ssr reads back from the browser.

import { createClient } from '@supabase/supabase-js'

const URL = 'https://pqvnjgyqbxlylawwogjv.supabase.co'
const ANON = 'sb_publishable_3uRUZqdvazd4cENt8WOWJA_SB7HmCEE'

// Mirror the in-memory cookie store @supabase/ssr uses in the browser.
// When signInWithPassword finishes, the SDK writes a session into localStorage
// AND it builds a "Set-Cookie" payload (in browser land). To reproduce the
// cookie value exactly, we run the SAME JSON.stringify + base64url encode
// that ssr/utils/chunker.js does internally.
function toCookieValue(jsonSession) {
  const json = JSON.stringify(jsonSession)
  const base64url = Buffer.from(json, 'utf8')
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
  // The "base64-" prefix is what ssr's decodeChunkedCookieValue strips before
  // base64url-decoding back to JSON.
  return 'base64-' + base64url
}

async function main() {
  const sb = createClient(URL, ANON, {
    auth: { persistSession: false },
  })
  const r = await sb.auth.signInWithPassword({
    email: 'john.doe@example.com',
    password: 'password123',
  })
  if (r.error) throw r.error

  const s = r.data.session
  const sessionJson = {
    access_token: s.access_token,
    refresh_token: s.refresh_token,
    provider_token: null,
    provider_refresh_token: null,
    user: s.user,
    expires_at: s.expires_at,
    expires_in: s.expires_in,
    token_type: 'bearer',
  }
  const cookieValue = toCookieValue(sessionJson)
  console.log('cookie size:', cookieValue.length, 'chars')
  console.log('preview:', cookieValue.slice(0, 80) + '...')

  const APP = 'https://localit-vn.vercel.app'

  // Try the modern ssr format with "base64-" prefix
  console.log('\n--- Try 1: sb-pqvnjgyqbxlylawwogjv-auth-token with base64- prefix ---')
  let res = await fetch(APP + '/tourist/dashboard', {
    headers: {
      cookie: `sb-pqvnjgyqbxlylawwogjv-auth-token=${cookieValue}`,
      'user-agent': 'Mozilla/5.0',
    },
    redirect: 'manual',
  })
  console.log(`HTTP ${res.status} loc=${res.headers.get('location')}`)

  // Without the prefix (raw JSON-stringified)
  console.log('\n--- Try 2: raw JSON-stringified ---')
  const rawJson = JSON.stringify(sessionJson)
  res = await fetch(APP + '/tourist/dashboard', {
    headers: {
      cookie: `sb-pqvnjgyqbxlylawwogjv-auth-token=${rawJson}`,
      'user-agent': 'Mozilla/5.0',
    },
    redirect: 'manual',
  })
  console.log(`HTTP ${res.status} loc=${res.headers.get('location')}`)

  // base64url-encoded (no prefix)
  console.log('\n--- Try 3: base64url encoded, no prefix ---')
  const b64urlOnly = Buffer.from(rawJson, 'utf8')
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
  res = await fetch(APP + '/tourist/dashboard', {
    headers: {
      cookie: `sb-pqvnjgyqbxlylawwogjv-auth-token=${b64urlOnly}`,
      'user-agent': 'Mozilla/5.0',
    },
    redirect: 'manual',
  })
  console.log(`HTTP ${res.status} loc=${res.headers.get('location')}`)

  // chunked with base64- prefix
  console.log('\n--- Try 4: chunked with base64- prefix ---')
  const half = Math.ceil(cookieValue.length / 2)
  const chunk0 = cookieValue.slice(0, half)
  const chunk1 = cookieValue.slice(half)
  res = await fetch(APP + '/tourist/dashboard', {
    headers: {
      cookie:
        `sb-pqvnjgyqbxlylawwogjv-auth-token.0=${chunk0}; ` +
        `sb-pqvnjgyqbxlylawwogjv-auth-token.1=${chunk1}`,
      'user-agent': 'Mozilla/5.0',
    },
    redirect: 'manual',
  })
  console.log(`HTTP ${res.status} loc=${res.headers.get('location')}`)

  // Try /buddy/dashboard with buddy session
  const r2 = await sb.auth.signInWithPassword({
    email: 'lan.pham@localit.dev',
    password: 'password123',
  })
  const s2 = r2.data.session
  const session2 = {
    access_token: s2.access_token, refresh_token: s2.refresh_token,
    provider_token: null, provider_refresh_token: null, user: s2.user,
    expires_at: s2.expires_at, expires_in: s2.expires_in, token_type: 'bearer',
  }
  const c2 = toCookieValue(session2)
  console.log('\n--- Try 5: buddy session /buddy/dashboard ---')
  res = await fetch(APP + '/buddy/dashboard', {
    headers: {
      cookie: `sb-pqvnjgyqbxlylawwogjv-auth-token=${c2}`,
      'user-agent': 'Mozilla/5.0',
    },
    redirect: 'manual',
  })
  console.log(`HTTP ${res.status} loc=${res.headers.get('location')}`)

  // And /map with buddy session (the user's complaint)
  console.log('\n--- Try 6: buddy session /map (user complaint) ---')
  res = await fetch(APP + '/map', {
    headers: {
      cookie: `sb-pqvnjgyqbxlylawwogjv-auth-token=${c2}`,
      'user-agent': 'Mozilla/5.0',
    },
    redirect: 'manual',
  })
  console.log(`HTTP ${res.status} loc=${res.headers.get('location')}`)
}

main().catch(e => { console.error(e); process.exit(1) })
