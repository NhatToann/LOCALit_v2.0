#!/usr/bin/env node
/**
 * Regression test for the "reset link says expired" bug (2026-10-11).
 *
 * Replays the exact detection logic from app/reset-password/page.tsx
 * against every URL shape Supabase can produce, using a REAL GoTrue-issued
 * access token shape (JWT payload with `amr: [{method:'password_recovery'}]`
 * for recovery grants, `[{method:'password'}]` for normal sign-ins).
 *
 * The bug: @supabase/ssr forces flowType:'pkce', so real reset links are
 * /reset-password?code=…&sb_flow_id=… — which the old code did not
 * recognise, because it only looked for the implicit-flow markers
 * (#access_token=…&type=recovery). Every valid link reported "expired".
 *
 * Run: node scripts/test-reset-link-detection.mjs
 */

// ---------- helpers copied verbatim from the page ----------
function toBase64(b64url) {
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/')
  return b64 + '='.repeat((4 - (b64.length % 4)) % 4)
}
function decodeJwtPayload(jwt) {
  return JSON.parse(atob(toBase64(jwt.split('.')[1])))
}
function decodeSessionCookie(value) {
  return JSON.parse(atob(toBase64(value)))
}

function isRecoverySession(url, cookieValue) {
  const hash = new URLSearchParams(url.hash.replace(/^#/, ''))
  const query = new URLSearchParams(url.search)
  if (query.get('code')) return true
  if ((hash.get('type') ?? query.get('type')) === 'recovery') return true
  const raw = hash.get('access_token') ?? query.get('access_token')
  if (raw) {
    const claims = decodeJwtPayload(raw)
    if (Array.isArray(claims.amr) && claims.amr.some((a) => a?.method === 'password_recovery')) {
      return true
    }
  }
  return false
}

function cookieHoldsRecoverySession(cookieValue) {
  if (!cookieValue) return false
  let value = cookieValue
  if (value.startsWith('base64-')) value = value.slice('base64-'.length)
  const session = decodeSessionCookie(value)
  if (!session.access_token) return false
  const claims = decodeJwtPayload(session.access_token)
  return (
    Array.isArray(claims.amr) &&
    claims.amr.some((a) => a?.method === 'password_recovery')
  )
}

// ---------- fixtures ----------
function b64url(obj) {
  return Buffer.from(JSON.stringify(obj)).toString('base64url')
}
function makeJwt(payload) {
  return `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url(payload)}.sig`
}
function makeCookie(accessToken) {
  return (
    'base64-' +
    Buffer.from(JSON.stringify({ access_token: accessToken })).toString('base64url')
  )
}

const RECOVERY_JWT = makeJwt({
  sub: 'user-1',
  email: 'darklunatv@gmail.com',
  amr: [{ method: 'password_recovery', timestamp: 1 }],
})
const NORMAL_JWT = makeJwt({
  sub: 'user-1',
  email: 'sarah@example.com',
  amr: [{ method: 'password', timestamp: 1 }],
})

// ---------- the full page decision ----------
function decide(initialUrl, cookieValue, exchangeWritesRecoveryCookie) {
  const url = new URL(initialUrl)
  let cameFromRecoveryLink = isRecoverySession(url, cookieValue)

  const hasPkceCode = new URLSearchParams(url.search).get('code') != null
  const hasImplicitHash = url.hash.includes('access_token')

  if (hasPkceCode || hasImplicitHash) {
    // SDK exchanges the code. On success it writes a recovery session
    // cookie; on failure the old (ambient) cookie stays put.
    if (exchangeWritesRecoveryCookie) cookieValue = makeCookie(RECOVERY_JWT)
    // The cookie claim is the DECIDING evidence once an exchange was
    // attempted — `?code=` alone is only provisional.
    cameFromRecoveryLink = cookieHoldsRecoverySession(cookieValue)
  }
  return cameFromRecoveryLink
}

// ---------- assertions ----------
let pass = 0
let fail = 0
function check(name, actual, expected) {
  const ok = actual === expected
  ok ? pass++ : fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${name} — got ${actual}, want ${expected}`)
}

const BASE = 'https://localit-nhattoann.vercel.app/reset-password'

// 1. THE BUG: a real PKCE recovery link, exchange succeeds.
check(
  'PKCE recovery link (?code=) is recognised',
  decide(`${BASE}?code=abc123&sb_flow_id=xyz`, null, true),
  true,
)

// 2. PKCE link whose exchange FAILED — ambient session present.
check(
  'PKCE link with failed exchange is rejected (no ambient leak)',
  decide(`${BASE}?code=bad`, makeCookie(NORMAL_JWT), false),
  false,
)

// 3. Implicit-flow recovery link still works (back-compat).
check(
  'implicit recovery link (#access_token&type=recovery) works',
  decide(`${BASE}#access_token=${RECOVERY_JWT}&type=recovery`, null, true),
  true,
)

// 4. Plain sign-in cookie, no link markers at all.
check(
  'ambient session with no link is rejected',
  decide(BASE, makeCookie(NORMAL_JWT), false),
  false,
)

// 5. A recovery link replayed while signed in as someone else — the
//    SECURITY case the 2026-10-10 gate was added for. The recovery
//    exchange replaces the cookie, so this must pass…
check(
  'recovery link replaces ambient session and is accepted',
  decide(`${BASE}?code=abc`, makeCookie(NORMAL_JWT), true),
  true,
)

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)