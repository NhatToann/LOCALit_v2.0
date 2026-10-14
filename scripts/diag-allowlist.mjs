#!/usr/bin/env node
/**
 * Is the reset link dying because of the Redirect URL allowlist?
 *
 * Symptom: the emailed link lands on
 *   https://localit-nhattoann.vercel.app/?error=access_denied&error_code=otp_expired...
 * i.e. the SITE ROOT, not /reset-password.
 *
 * GoTrue only honours `redirect_to` when the URL matches the project's
 * allowlist. On a mismatch it ignores the requested path and sends the
 * user to the configured Site URL (root) carrying an error payload.
 * That is exactly the fingerprint we are seeing.
 *
 * Probe: POST /auth/v1/recover with three different redirect_to values
 * and compare the responses. A rejected allowlist entry produces a
 * different error (or a different success shape) than an accepted one.
 *
 * Note: recover always answers 200 for a known address to avoid email
 * enumeration, so we compare the error/session fields instead.
 */
const SUPABASE = 'https://pqvnjgyqbxlylawwogjv.supabase.co'
const ANON = 'sb_publishable_3uRUZqdvazd4cENt8WOWJA_SB7HmCEE'
const EMAIL = 'darklunatv@gmail.com'

const headers = {
  apikey: ANON,
  'Content-Type': 'application/json',
  Authorization: `Bearer ${ANON}`,
}

async function probe(label, redirectTo) {
  const res = await fetch(`${SUPABASE}/auth/v1/recover`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      email: EMAIL,
      gotrue_meta_security: {},
      ...(redirectTo ? { options: { redirect_to: redirectTo } } : {}),
    }),
  })
  const body = await res.json().catch(() => ({}))
  const keys = Object.keys(body)
  console.log(`\n[${label}]`)
  console.log(`  redirect_to : ${redirectTo ?? '(omitted)'}`)
  console.log(`  status      : ${res.status}`)
  console.log(`  keys        : ${keys.length ? keys.join(', ') : '(empty)'}`)
  if (body.msg || body.error_description || body.message || body.error) {
    console.log(`  message     : ${body.msg || body.error_description || body.message || body.error}`)
  }
  if (body.code) console.log(`  code        : ${body.code}`)
  return { status: res.status, body }
}

console.log('=== Supabase redirect allowlist probe ===')
console.log(`project: pqvnjgyqbxlylawwogjv`)

const a = await probe('A: localit-vn /reset-password (what the app sends today)', 'https://localit-vn.vercel.app/reset-password')
const b = await probe('B: localit-nhattoann /reset-password', 'https://localit-nhattoann.vercel.app/reset-password')
const c = await probe('C: definitely-not-allowlisted domain', 'https://not-allowlisted-xyz-12345.example.com/reset-password')
const d = await probe('D: omitted (uses Site URL default)', null)

console.log('\n=== verdict ===')
const differs = (x, y) => JSON.stringify(x.body) !== JSON.stringify(y.body)
console.log(`  A vs C (allowlisted vs not): ${differs(a, c) ? 'DIFFERENT -> allowlist IS enforced' : 'identical -> allowlist not the cause'}`)
console.log(`  A vs B (two of our domains) : ${differs(a, b) ? 'DIFFERENT -> domains differ in allowlist' : 'identical -> both treated the same'}`)
console.log(`  A vs D (explicit vs omitted): ${differs(a, d) ? 'DIFFERENT' : 'identical'}`)