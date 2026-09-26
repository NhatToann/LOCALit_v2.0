#!/usr/bin/env node
/**
 * Check trigger state and verify-otp side effects.
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
  // 1. Check tourists is_visible filter — does it actually filter?
  console.log('=== T1: tourists is_visible filter ===')
  const visible = await req(`${SUPA}/rest/v1/tourists?select=id,is_visible,nationality&is_visible=eq.true&limit=100`, {
    headers: { apikey: ANON, authorization: 'Bearer ' + ANON },
  })
  const all = await req(`${SUPA}/rest/v1/tourists?select=id,is_visible&limit=100`, {
    headers: { apikey: ANON, authorization: 'Bearer ' + ANON },
  })
  console.log('all visible:', all.json?.length, 'filter applied:', visible.json?.length)

  // 2. Same for buddies
  console.log('\n=== T2: buddies is_available filter ===')
  const allB = await req(`${SUPA}/rest/v1/buddies?select=id,is_available&limit=100`, {
    headers: { apikey: ANON, authorization: 'Bearer ' + ANON },
  })
  console.log('all buddies:', allB.json?.length)

  // 3. Verify the XSS — was it actually stored in profiles? We saw profiles count=0 earlier.
  // But maybe profiles has RLS that filters. Let's test with authenticated user via signup.
  console.log('\n=== T3: Look at newly created XSS profile via login + RLS check ===')
  // We can't easily check this without an authenticated user, but we CAN see what anon sees
  const profiles = await req(`${SUPA}/rest/v1/profiles?select=*&limit=100`, {
    headers: { apikey: ANON, authorization: 'Bearer ' + ANON },
  })
  console.log('profiles anon count:', profiles.json?.length)
  if (profiles.json?.length) {
    console.log('sample:', JSON.stringify(profiles.json[0], null, 2))
  }

  // 4. Look at the tourists' id UUIDs — does the id correspond to an auth user we can enumerate?
  console.log('\n=== T4: Map tourist id to email via supabase auth ===')
  const t = await req(`${SUPA}/rest/v1/tourists?select=id&limit=2`, {
    headers: { apikey: ANON, authorization: 'Bearer ' + ANON },
  })
  console.log('first two tourist ids:', t.json?.map(x => x.id))

  // 5. Check connection via auth.admin.listUsers — does anon have any access?
  const admin1 = await req(`${SUPA}/auth/v1/admin/users?perPage=1`, {
    headers: { apikey: ANON, authorization: 'Bearer ' + ANON },
  })
  console.log('\n=== T5: anon admin list users ===')
  console.log('status:', admin1.status, admin1.text.slice(0, 300))

  // 6. Verify the XSS in profile.full_name — fetch the page that renders profiles
  // We can use the home page or a profile page
  console.log('\n=== T6: Check how profiles render ===')
  // We know the register page and dashboard pages — try /buddy/dashboard
  const dash = await fetch(`${PROD}/buddy/dashboard`)
  const dashText = await dash.text()
  console.log('dashboard status:', dash.status, 'size:', dashText.length)

  // 7. Check if XSS in full_name leaks to ANY page
  // Look for "<script" in any public page
  for (const path of ['/', '/tourist/dashboard', '/buddy/dashboard', '/login', '/register', '/about']) {
    try {
      const r = await fetch(`${PROD}${path}`)
      const t = await r.text()
      const has = t.includes('<script>alert') || t.includes('alert(1)')
      console.log(`  ${path}: status=${r.status} size=${t.length} hasXSS=${has}`)
    } catch (e) {
      console.log(`  ${path}: error ${e.message}`)
    }
  }

  // 8. Check the response cookie behavior
  console.log('\n=== T8: cookie domain for session ===')
  const loginR = await req(`${SUPA}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', apikey: ANON },
    body: JSON.stringify({ email: 'john.doe@example.com', password: 'password123' }),
  })
  console.log('login status:', loginR.status)
  // The cookies aren't set here since we're using anon — let me check what set-cookie looks like
  const r = await fetch(`${SUPA}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', apikey: ANON },
    body: JSON.stringify({ email: 'john.doe@example.com', password: 'password123' }),
  })
  console.log('set-cookie:', r.headers.get('set-cookie'))
}

main().catch(e => { console.error('FATAL', e); process.exit(1) })