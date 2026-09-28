import { NextResponse } from 'next/server'
import { createHmac } from 'node:crypto'
import { createClient } from '@/utils/supabase/server'

/**
 * POST /api/stringee/access-token — issue a Stringee JWT for an
 * authenticated LOCALit user.
 *
 * Why server-side: the Stringee API Key Secret must NEVER be exposed
 * to the browser. The client sends a Supabase auth cookie, we verify
 * the user is signed in, then sign a short-lived JWT and return it.
 *
 * Token shape (per https://developer.stringee.com/docs/client-authentication):
 *   header  = { "typ": "JWT", "alg": "HS256", "cty": "stringee-api;v=1" }
 *   payload = { "jti": "<apiKeySid>-<timestamp>",
 *               "iss": "<apiKeySid>",
 *               "exp": <unix-seconds>,
 *               "userId": "<supabase-user-id>" }
 *   signature = HMACSHA256(base64Url(header) + "." + base64Url(payload),
 *                          apiKeySecret)  -> base64Url
 *
 * Env vars (set in Vercel production; do NOT commit):
 *   STRINGEE_API_KEY_SID     e.g. "SK.0.xrIw0yUPPlXKDtCjQd8aC3JkpHHHz793"
 *   STRINGEE_API_KEY_SECRET  e.g. "YTZOOVJ3aGIzempFSkxwakQ5WFBKNmtMQ0N6WDNDeGM="
 *
 * Returns: { accessToken, expiresAt, userId }
 * Errors:
 *   401 - caller has no Supabase session
 *   503 - Stringee env not configured on server
 *   500 - signing failed
 */

function b64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function signHs256(header: object, payload: object, secret: string): string {
  const h = b64url(Buffer.from(JSON.stringify(header)))
  const p = b64url(Buffer.from(JSON.stringify(payload)))
  const data = `${h}.${p}`
  const sig = createHmac('sha256', secret).update(data).digest()
  return `${data}.${b64url(sig)}`
}

export async function POST() {
  const apiKeySid = process.env.STRINGEE_API_KEY_SID
  const apiKeySecret = process.env.STRINGEE_API_KEY_SECRET

  if (!apiKeySid || !apiKeySecret) {
    return NextResponse.json(
      { error: 'Stringee is not configured on this server.', reason: 'misconfigured' },
      { status: 503 },
    )
  }

  // Verify the caller has a Supabase session. The server client reads
  // the request cookies set by the Supabase SSR client when the user
  // signed in. If the session is missing or expired, we return 401.
  let userId: string
  try {
    const supabase = await createClient()
    const { data, error } = await supabase.auth.getUser()
    if (error || !data.user) {
      return NextResponse.json(
        { error: 'Sign in to LOCALit before requesting a Stringee token.', reason: 'unauthenticated' },
        { status: 401 },
      )
    }
    userId = data.user.id
  } catch (err) {
    return NextResponse.json(
      { error: 'Could not verify Supabase session.', reason: 'auth_error' },
      { status: 500 },
    )
  }

  const ttl = 60 * 60 // 1 hour — Stringee tokens should be short-lived
  const nowSec = Math.floor(Date.now() / 1000)
  const exp = nowSec + ttl
  const jti = `${apiKeySid}-${nowSec}`

  const header = { typ: 'JWT', alg: 'HS256', cty: 'stringee-api;v=1' }
  const payload = {
    jti,
    iss: apiKeySid,
    exp,
    userId,
  }

  let accessToken: string
  try {
    accessToken = signHs256(header, payload, apiKeySecret)
  } catch (err) {
    return NextResponse.json(
      { error: 'Could not sign Stringee token.', reason: 'sign_error' },
      { status: 500 },
    )
  }

  return NextResponse.json({
    accessToken,
    expiresAt: exp,
    userId,
  })
}