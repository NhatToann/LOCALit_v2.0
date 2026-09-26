// Comprehensive production smoke test for localit-vn.vercel.app
// Tests the key user-facing flows using the correct @supabase/ssr cookie format.

import { createClient } from '@supabase/supabase-js'

const APP = 'https://localit-vn.vercel.app'
const URL = 'https://pqvnjgyqbxlylawwogjv.supabase.co'
const ANON = 'sb_publishable_3uRUZqdvazd4cENt8WOWJA_SB7HmCEE'

let failures = 0
function assert(name, ok, extra = '') {
  console.log(`  ${ok ? '✓' : '✗'}  ${name}${extra ? ' — ' + extra : ''}`)
  if (!ok) failures++
}

function toCookieValue(sessionJson) {
  const json = JSON.stringify(sessionJson)
  const b64 = Buffer.from(json, 'utf8')
    .toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
  return 'base64-' + b64
}

async function login(email, password) {
  const sb = createClient(URL, ANON, { auth: { persistSession: false } })
  const r = await sb.auth.signInWithPassword({ email, password })
  if (r.error) throw r.error
  const s = r.data.session
  return `sb-pqvnjgyqbxlylawwogjv-auth-token=${toCookieValue({
    access_token: s.access_token, refresh_token: s.refresh_token,
    provider_token: null, provider_refresh_token: null, user: s.user,
    expires_at: s.expires_at, expires_in: s.expires_in, token_type: 'bearer',
  })}`
}

async function fetchPage(url, { cookie = '' } = {}) {
  const r = await fetch(url, {
    headers: { cookie, 'user-agent': 'Mozilla/5.0 NON-TECH-USER' },
    redirect: 'manual',
  })
  const body = r.status === 200 ? await r.text() : ''
  return { status: r.status, location: r.headers.get('location'), body }
}

async function main() {
  // ─── 0. Anonymous homepage ───────────────────────────────────────────────
  console.log('\n[Flow 0] Anonymous homepage')
  const home = await fetchPage(APP + '/')
  assert('homepage returns 200', home.status === 200)
  if (home.status === 200) {
    assert('hero "Connect with trusted local guides" present', home.body.includes('Connect with trusted local guides'))
    assert('footer has "Stay in the loop"', home.body.includes('Stay in the loop'))
    assert('footer mailto Contact Us', /mailto:support@localit\.dev/.test(home.body))
    assert('footer has Status link', home.body.includes('Status'))
    assert('footer has Sitemap link', home.body.includes('Sitemap'))
    assert('footer has Forgot Password link', home.body.includes('Forgot Password'))
  }

  // ─── Login ──────────────────────────────────────────────────────────────
  const lanCookie = await login('lan.pham@localit.dev', 'password123')
  const johnCookie = await login('john.doe@example.com', 'password123')

  // ─── A. Buddy /map — user complaint: redirect to login? ─────────────────
  console.log('\n[Flow A] Buddy /map (user complaint: "click map from buddy → login")')
  const buddyMap = await fetchPage(APP + '/map', { cookie: lanCookie })
  assert('/map loads for buddy (not redirected to login)', buddyMap.status === 200,
    `HTTP ${buddyMap.status} loc=${buddyMap.location}`)

  // ─── B. Buddy /buddy/dashboard ──────────────────────────────────────────
  console.log('\n[Flow B] Buddy /buddy/dashboard')
  const buddyDash = await fetchPage(APP + '/buddy/dashboard', { cookie: lanCookie })
  assert('buddy dashboard returns 200', buddyDash.status === 200,
    `HTTP ${buddyDash.status} loc=${buddyDash.location}`)

  // ─── C. Tourist /tourist/dashboard — key map-at-top check ───────────────
  console.log('\n[Flow C] Tourist /tourist/dashboard — map-at-top')
  const dash = await fetchPage(APP + '/tourist/dashboard', { cookie: johnCookie })
  assert('dashboard returns 200', dash.status === 200,
    `HTTP ${dash.status} loc=${dash.location}`)
  if (dash.status === 200) {
    // After fix: hero greeting first, then map heading, then stats
    const heroIdx  = dash.body.indexOf('Welcome back')
    const mapIdx   = dash.body.indexOf("Who") >= 0 && dash.body.indexOf("around you") >= 0
                        ? dash.body.indexOf("Who") : -1
    const statsIdx = dash.body.indexOf('dashboard-stats-grid')
    assert('Hero greeting present', heroIdx >= 0)
    assert('"Who\'s around you" heading present in HTML', mapIdx >= 0,
      'The featured map section must be server-rendered')
    assert('Stats grid present', statsIdx >= 0)
    if (mapIdx >= 0 && statsIdx >= 0) {
      assert('Map heading appears BEFORE stats grid (map above stats)',
        mapIdx < statsIdx,
        `mapIdx=${mapIdx} statsIdx=${statsIdx}`)
    }
  }

  // ─── D. Tourist browse + buddy detail ───────────────────────────────────
  console.log('\n[Flow D] Tourist browse + buddy detail')
  const browse = await fetchPage(APP + '/tourist/browse', { cookie: johnCookie })
  assert('browse returns 200', browse.status === 200)
  const buddyDetail = await fetchPage(APP + '/tourist/buddy/11111111-1111-1111-1111-111111111111', { cookie: johnCookie })
  assert('buddy detail returns 200', buddyDetail.status === 200)
  if (buddyDetail.status === 200) {
    assert('buddy detail has hourly rate', /\$15/.test(buddyDetail.body))
    assert('buddy detail has specialties', buddyDetail.body.includes('Beach'))
  }

  // ─── E. Tourist profile form ───────────────────────────────────────────
  console.log('\n[Flow E] Tourist profile form')
  const profile = await fetchPage(APP + '/tourist/profile', { cookie: johnCookie })
  assert('profile returns 200', profile.status === 200)
  if (profile.status === 200) {
    assert('profile does NOT show "undefined" bug', !/John undefined/.test(profile.body))
  }

  // ─── F. Trip creation ─────────────────────────────────────────────────
  console.log('\n[Flow F] Trip creation')
  const create = await fetchPage(APP + '/tourist/trips/create', { cookie: johnCookie })
  assert('trips/create returns 200', create.status === 200)
  if (create.status === 200) {
    assert('trips/create shows "Plan a new trip"', create.body.includes('Plan a new trip'))
  }

  // ─── G. Trips list ────────────────────────────────────────────────────
  console.log('\n[Flow G] Trips list')
  const trips = await fetchPage(APP + '/tourist/trips', { cookie: johnCookie })
  assert('trips list returns 200', trips.status === 200)

  // ─── H. Chat page ──────────────────────────────────────────────────────
  console.log('\n[Flow H] Chat')
  const chat = await fetchPage(APP + '/chat', { cookie: johnCookie })
  assert('chat returns 200', chat.status === 200)

  // ─── I. Buddy requests page ─────────────────────────────────────────────
  console.log('\n[Flow I] Buddy requests')
  const reqs = await fetchPage(APP + '/buddy/requests', { cookie: lanCookie })
  assert('buddy requests returns 200', reqs.status === 200)
  if (reqs.status === 200) {
    assert('buddy requests has no 500/permission errors',
      !reqs.body.includes('permission denied') && !reqs.body.includes('Internal Server Error'))
  }

  // ─── J. Buddy profile ─────────────────────────────────────────────────
  console.log('\n[Flow J] Buddy profile')
  const buddyProfile = await fetchPage(APP + '/buddy/profile', { cookie: lanCookie })
  assert('buddy profile returns 200', buddyProfile.status === 200)

  // ─── Summary ───────────────────────────────────────────────────────────
  console.log('\n────────────────────────────────────────────────')
  if (failures === 0) {
    console.log('✓ All assertions passed — production is clean.')
  } else {
    console.log(`✗ ${failures} assertion(s) failed.`)
    process.exit(1)
  }
}

main().catch(e => { console.error('UNCAUGHT:', e); process.exit(2) })
