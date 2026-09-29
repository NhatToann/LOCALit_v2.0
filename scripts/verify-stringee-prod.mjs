// End-to-end test: sign in to Supabase → build the exact
// chunked cookie format the @supabase/ssr server client expects
// → call /api/stringee/access-token via vercel curl (bypasses Vercel
// SSO gate) → verify the returned Stringee JWT.

import { createClient } from '@supabase/supabase-js'
import { createChunks } from '@supabase/ssr'
import { execSync } from 'node:child_process'
import { createHmac } from 'node:crypto'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const API_BASE = process.env.API_BASE || 'https://localit-nhattoann.vercel.app'
const SUPABASE_REF = SUPABASE_URL?.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1]
const USER_EMAIL = 'john.doe@example.com'
const USER_PASSWORD = 'password123'

if (!SUPABASE_URL || !SUPABASE_ANON || !SUPABASE_REF) {
  console.error('Need NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY')
  process.exit(1)
}

function b64urlDecode(s) {
  s = s.replace(/-/g, '+').replace(/_/g, '/')
  while (s.length % 4) s += '='
  return Buffer.from(s, 'base64')
}

async function main() {
  console.log(`Smoke testing /api/stringee/access-token via vercel curl at ${API_BASE}\n`)

  // 1. Sign in
  const sb = createClient(SUPABASE_URL, SUPABASE_ANON, { auth: { persistSession: false } })
  const { data, error } = await sb.auth.signInWithPassword({
    email: USER_EMAIL,
    password: USER_PASSWORD,
  })
  if (error || !data.session) {
    console.error('signin failed:', error)
    process.exit(1)
  }
  const { access_token, refresh_token, user } = data.session
  console.log(`  Sign-in OK: userId=${user.id}`)

  // 2. Build the cookie set the way the SSR client writes it.
  // The session is JSON-stringified into a single chunk keyed by
  // "auth-token". Supabase prefixes the storage key with `sb-<ref>-`
  // and uses base64-URL encoding for the value (when cookieEncoding
  // is 'base64url', the default in 0.12.x).
  const storageKey = 'auth-token'
  const sessionJson = JSON.stringify({
    access_token,
    refresh_token,
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3500,
  })
  // base64-URL encode the JSON (matching stringToBase64URL)
  const base64 = Buffer.from(sessionJson).toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
  const chunkedValue = `base64-${base64}`

  const cookies = []
  const chunks = createChunks(storageKey, chunkedValue)
  for (const c of chunks) {
    cookies.push(`${SUPABASE_REF}-${c.name}=${encodeURIComponent(c.value ?? '')}`)
  }
  // Also try without the `sb-` prefix (some Supabase versions use
  // just `<ref>-auth-token`; others use `sb-<ref>-auth-token`).
  const cookieHeaderSb = `sb-${cookies.join('; sb-')}`
  const cookieHeaderBare = cookies.join('; ')

  // 3. Hit the route via vercel curl. Try both cookie names.
  for (const [label, cookieHeader] of [
    ['sb-<ref>-auth-token', cookieHeaderSb],
    ['<ref>-auth-token', cookieHeaderBare],
  ]) {
    const cmd = `vercel curl "${API_BASE}/api/stringee/access-token" -X POST -H "content-type: application/json" -H "cookie: ${cookieHeader}"`
    const out = execSync(cmd, { encoding: 'utf8' })
    const jsonLine = out
      .split('\n')
      .reverse()
      .find((l) => l.startsWith('{'))
    if (!jsonLine) {
      console.log(`  [${label}] no JSON response`)
      continue
    }
    const body = JSON.parse(jsonLine)
    console.log(`\n  [${label}] response:`, jsonLine.slice(0, 100))
    if (body.accessToken) {
      const [h, p] = body.accessToken.split('.')
      const header = JSON.parse(b64urlDecode(h).toString())
      const payload = JSON.parse(b64urlDecode(p).toString())
      console.log('  header:', JSON.stringify(header))
      console.log('  payload:', JSON.stringify(payload))
      // Verify signature with our local secret (which we don't have
      // in this script; the standalone verify-stringee-jwt.mjs does
      // that).
      const ok =
        header.alg === 'HS256' &&
        header.cty === 'stringee-api;v=1' &&
        payload.userId === user.id &&
        payload.exp > Math.floor(Date.now() / 1000) &&
        body.userId === user.id
      console.log(ok ? '  OK' : '  FAIL')
      if (ok) process.exit(0)
    } else {
      console.log(`  [${label}] body.error:`, body.error)
    }
  }
  process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(2)
})