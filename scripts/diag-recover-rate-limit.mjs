#!/usr/bin/env node
/**
 * Characterise the `over_email_send_rate_limit` on /auth/v1/recover.
 *
 * We know from the browser log that the redirect fix landed:
 *   redirect_to=https://localit-vn.vercel.app/reset-password
 * so the remaining 429 is purely an email-sending limit.
 *
 * Two questions matter for the user right now:
 *   1. Is the limit per-RECIPIENT or per-PROJECT?
 *   2. How long until it clears?
 *
 * (1) decides whether switching to a different address helps at all.
 * (2) decides whether to tell the user "wait 10 minutes" or "wait an hour".
 */
const SUPABASE = 'https://pqvnjgyqbxlylawwogjv.supabase.co'
const ANON = 'sb_publishable_3uRUZqdvazd4cENt8WOWJA_SB7HmCEE'
const REDIRECT = 'https://localit-vn.vercel.app/reset-password'

const headers = {
  apikey: ANON,
  'Content-Type': 'application/json',
  Authorization: `Bearer ${ANON}`,
}

async function tryRecover(email, label) {
  const res = await fetch(`${SUPABASE}/auth/v1/recover?redirect_to=${encodeURIComponent(REDIRECT)}`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ email }),
  })
  const body = await res.json().catch(() => ({}))
  const sbCode = res.headers.get('x-sb-error-code')
  console.log(`  [${label}] ${email}`)
  console.log(`    status : ${res.status}`)
  console.log(`    sb-code: ${sbCode ?? '(none)'}`)
  console.log(`    msg    : ${body.msg ?? body.error_description ?? '(none)'}`)
  console.log(`    ratelimit-reset: ${res.headers.get('x-ratelimit-reset') ?? '(not sent)'}`)
  console.log(`    ratelimit-remaining: ${res.headers.get('x-ratelimit-remaining') ?? '(not sent)'}`)
  return { status: res.status, sbCode, body }
}

console.log('=== recover rate-limit characterisation ===\n')

console.log('Test 1 — the address the user actually wants to reset:')
const a = await tryRecover('darklunatv@gmail.com', 'target')

console.log('\nTest 2 — a different, definitely-unregistered address:')
const b = await tryRecover(`ratelimit-probe-${Date.now()}@example.com`, 'other')

console.log('\n=== verdict ===')
if (a.status === 429 && b.status === 429) {
  console.log('  PER-PROJECT limit. Switching recipient will NOT help.')
  console.log('  The whole project is throttled on outbound email.')
} else if (a.status === 429 && b.status !== 429) {
  console.log('  PER-RECIPIENT limit. A different address would work,')
  console.log('  but that is not an acceptable workaround for password reset.')
} else {
  console.log('  Limit has CLEARED — the user can request a reset right now.')
}

if (a.status !== 429) {
  console.log('\n  -> Tell the user to retry the reset now.')
} else {
  console.log('\n  -> Tell the user to wait, then retry. No ratelimit-reset')
  console.log('     header is exposed, so the exact window must be confirmed')
  console.log('     from the Supabase dashboard (Auth → Rate Limits).')
}