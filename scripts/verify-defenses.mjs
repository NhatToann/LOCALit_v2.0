#!/usr/bin/env node
/**
 * Direct verification of hardened endpoints (post-defense state).
 * Tests against the freshly deployed fix on production.
 */

const PROD = 'https://localit-p8vc2ofho-nhattoann.vercel.app'
// Aliased domain
const DOMAIN = 'https://localit-vn.vercel.app'

async function post(url, body, headers = {}) {
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })
  const text = await r.text()
  let json = null
  try { json = JSON.parse(text) } catch {}
  return { status: r.status, body: text.slice(0, 250), json }
}

async function get(url, headers = {}) {
  const r = await fetch(url, {
    headers: { apikey: 'sb_publishable_3uRUZqdvazd4cENt8WOWJA_SB7HmCEE', authorization: 'Bearer sb_publishable_3uRUZqdvazd4cENt8WOWJA_SB7HmCEE', ...headers },
  })
  return { status: r.status, body: (await r.text()).slice(0, 400) }
}

async function main() {
  console.log('\n=== POST-DEPLOY VERIFICATION ===\n')

  console.log('TEST 1: Signup rate limit')
  for (let i = 0; i < 7; i++) {
    const r = await post(`${PROD}/api/auth/signup`, {
      email: `verify-${Date.now()}-${i}@test.com`,
      password: 'password123',
      fullName: `Verify ${i}`,
      role: 'tourist',
    })
    console.log(`  attempt ${i + 1}: ${r.status} ${r.body.slice(0, 80)}`)
  }

  console.log('\nTEST 2: Email enumeration (existing vs fresh, before limit kicks in)')
  const existingEmail = await post(`${PROD}/api/auth/signup`, {
    email: 'john.doe@example.com',
    password: 'password123',
    fullName: 'John Doe',
    role: 'tourist',
  })
  console.log('  existing email:', existingEmail.status, existingEmail.body.slice(0, 200))
  const fresh = await post(`${PROD}/api/auth/signup`, {
    email: `verify-fresh-${Date.now()}@test.com`,
    password: 'password123',
    fullName: 'Fresh',
    role: 'tourist',
  })
  console.log('  fresh email:    ', fresh.status, fresh.body.slice(0, 200))

  console.log('\nTEST 3: XSS in full_name (sanitized)')
  const xss = await post(`${PROD}/api/auth/signup`, {
    email: `xss-${Date.now()}@test.com`,
    password: 'password123',
    fullName: '<script>alert(1)</script>',
    role: 'tourist',
  })
  console.log('  xss result:', xss.status, xss.body.slice(0, 200))
  const xss2 = await post(`${PROD}/api/auth/signup`, {
    email: `xss2-${Date.now()}@test.com`,
    password: 'password123',
    fullName: '"><img src=x onerror=alert(1)>',
    role: 'buddy',
    profilePayload: { bio: '<svg/onload=alert(1)>bio' },
  })
  console.log('  xss buddy result:', xss2.status, xss2.body.slice(0, 200))

  console.log('\nTEST 4: Newsletter CSRF (different Origin)')
  const csrf = await fetch(`${PROD}/api/newsletter/subscribe`, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      origin: 'https://evil.example.com',
    },
    body: 'email=evil@evil.com',
  })
  console.log('  csrf:', csrf.status, (await csrf.text()).slice(0, 200))

  console.log('\nTEST 5: Anon profiles access (post-RLS fix)')
  const anonProfile = await get(`${PROD}/api/`) // not a real endpoint, but checks the relevant...
  console.log('  (skip direct anon check; RLS fix applied at DB level)')

  console.log('\nTEST 6: create-profile IDOR (no session, no token)')
  const idor = await post(`${PROD}/api/auth/create-profile`, {
    userId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    role: 'buddy',
    payload: { hourly_rate: 1, location_city: 'PWNED', bio: 'attacker was here' },
  })
  console.log('  IDOR no-auth:', idor.status, idor.body.slice(0, 200))

  console.log('\nTEST 7: create-profile with stale autoConfirm flag (deprecated)')
  const dep = await post(`${PROD}/api/auth/create-profile`, {
    userId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    role: 'tourist',
    payload: { nationality: 'EVIL' },
    autoConfirm: true,
  })
  console.log('  autoConfirm (deprecated):', dep.status, dep.body.slice(0, 200))

  console.log('\nTEST 8: Type confusion / huge payload')
  const huge = await post(`${PROD}/api/auth/create-profile`, {
    userId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    role: 'tourist',
    payload: { bio: 'X'.repeat(200_000) },
  })
  console.log('  huge payload:', huge.status, huge.body.slice(0, 200))

  console.log('\nTEST 9: Direct Supabase anon reads (post RLS fix)')
  for (const t of ['profiles', 'safe_profiles', 'tourists', 'buddies', 'reviews']) {
    const r = await get(`https://pqvnjgyqbxlylawwogjv.supabase.co/rest/v1/${t}?select=*&limit=1`)
    console.log(`  ${t}: ${r.status} — ${r.body.slice(0, 150).replace(/\n/g, ' ')}`)
  }

  console.log('\n=== END VERIFICATION ===\n')
}

main().catch(e => { console.error(e); process.exit(1) })
