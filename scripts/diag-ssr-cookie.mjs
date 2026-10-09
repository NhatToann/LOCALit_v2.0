// What cookie name does @supabase/ssr use for the access token?
// It splits the JWT in two chunks and stores them as
//   sb-<projectref>-auth-token.0 / .1 (or just .0 if chunked JSON).
// Then cookies().getAll() returns them. We need to set those two cookies.

import { createClient } from '@supabase/supabase-js'

const r = await fetch('https://pqvnjgyqbxlylawwogjv.supabase.co/auth/v1/token?grant_type=password', {
  method: 'POST',
  headers: { 'content-type': 'application/json', apikey: 'sb_publishable_3uRUZqdvazd4cENt8WOWJA_SB7HmCEE' },
  body: JSON.stringify({ email: 'john.doe@example.com', password: 'password123' }),
})
const j = await r.json()
console.log('keys:', Object.keys(j))
console.log('access_token len:', j.access_token?.length)
console.log('refresh_token len:', j.refresh_token?.length)
console.log('expires_in:', j.expires_in)
console.log('token_type:', j.token_type)

// The @supabase/ssr cookie name format
const projectRef = 'pqvnjgyqbxlylawwogjv'
const cookieName = `sb-${projectRef}-auth-token`

// The access_token is a JWT. @supabase/ssr stores it in chunks of ~2KB
// in cookies: cookie.0, cookie.1, etc. The value is a base64-encoded
// JSON of {access_token, refresh_token, ...} in chunk 0, and continuation
// of the stringified json in subsequent chunks.
const payload = JSON.stringify({
  access_token: j.access_token,
  refresh_token: j.refresh_token,
  expires_in: j.expires_in,
  expires_at: Math.floor(Date.now() / 1000) + (j.expires_in ?? 3600),
  token_type: j.token_type ?? 'bearer',
  user: j.user,
})
const b64 = Buffer.from(payload, 'utf8').toString('base64')
console.log('\nbase64 length:', b64.length)
const CHUNK = 2000
const chunks = Math.ceil(b64.length / CHUNK)
console.log('chunks:', chunks)
for (let i = 0; i < chunks; i++) {
  const value = b64.slice(i * CHUNK, (i + 1) * CHUNK)
  console.log(`  ${cookieName}.${i} = ${value.slice(0, 60)}...`)
}
