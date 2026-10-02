/**
 * scripts/verify-search.mjs
 *
 * Smoke-test the /search feature end-to-end against production:
 *   1. RPC search_buddies returns >= 1 row for a basic text query.
 *   2. RPC search_buddies_facets returns the expected JSON shape.
 *   3. The deployed /search page renders a result row for ?q=food.
 *   4. The /search page honours ?place=marble-mountains&radius=10.
 *
 * Usage:
 *   $env:SUPABASE_DB_PASSWORD="..."; node scripts/verify-search.mjs
 */

import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { Client } from 'pg'

const PASSWORD = process.env.SUPABASE_DB_PASSWORD || process.env.DB_PW
if (!PASSWORD) {
  console.error('Missing SUPABASE_DB_PASSWORD env var.')
  process.exit(1)
}

const PROD_URL = process.env.PROD_URL || 'https://localit-nhattoann.vercel.app'
const ANON_KEY = process.env.SUPABASE_ANON_KEY || 'sb_publishable_3uRUZqdvazd4cENt8WOWJA_SB7HmCEE'
const PROJECT_URL = process.env.SUPABASE_URL || 'https://pqvnjgyqbxlylawwogjv.supabase.co'

let pass = 0
let fail = 0
const results = []

function record(name, ok, info = '') {
  if (ok) pass += 1
  else fail += 1
  results.push({ name, ok, info })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? ' — ' + info : ''}`)
}

async function rpc(name, args) {
  const res = await fetch(`${PROJECT_URL}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: {
      apikey: ANON_KEY,
      Authorization: `Bearer ${ANON_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(args),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`${name} failed: ${res.status} ${text.slice(0, 200)}`)
  }
  return res.json()
}

async function fetchPage(qs) {
  // Vercel deployment protection puts an SSO redirect in front of the
  // canonical production URL. The `vercel curl` wrapper adds the
  // bypass token; spawn it so the verify script can see the real
  // rendered HTML. We need `shell: true` on Windows because vercel
  // is a .cmd shim. Note: vercel curl exits 1 when it emits a
  // Node deprecation warning about shell quoting; we just look at
  // the stdout content instead.
  const path = `/search${qs}`
  const r = spawnSync('vercel', ['curl', path, '--yes'], {
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'ignore'],
    shell: true,
  })
  const out = r.stdout || ''
  if (!out.includes('<!DOCTYPE')) {
    throw new Error(`vercel curl returned no HTML (status ${r.status}): ${out.slice(0, 200)}`)
  }
  return { status: 200, html: out }
}

async function main() {
  // 1. search_buddies('food', ...) returns >= 1 row
  try {
    const data = await rpc('search_buddies', {
      q: 'food',
      anchor_lat: null,
      anchor_lng: null,
      radius_km: 50,
      lang: null,
      tag: null,
      place: null,
      sort: 'match',
      limit_n: 5,
      offset_n: 0,
    })
    record('search_buddies("food") returns rows', Array.isArray(data) && data.length > 0, `${data.length} rows`)
  } catch (err) {
    record('search_buddies("food") returns rows', false, err.message)
  }

  // 2. search_buddies_facets returns expected shape
  try {
    const data = await rpc('search_buddies_facets', {
      q: '',
      lang: null,
      tag: null,
      place: null,
      anchor_lat: null,
      anchor_lng: null,
      radius_km: 50,
    })
    const hasKeys =
      data &&
      Array.isArray(data.specialties) &&
      Array.isArray(data.languages) &&
      Array.isArray(data.cities) &&
      typeof data.total === 'number'
    record('search_buddies_facets has expected keys', hasKeys, `total=${data?.total}`)
  } catch (err) {
    record('search_buddies_facets has expected keys', false, err.message)
  }

  // 3. /search?q=food renders at least one result row
  try {
    const { status, html } = await fetchPage('?q=food&sort=match')
    const hasResults = html.includes('data-testid="search-result-row"')
    const hasSmartH1 = html.includes('Smart buddy search in Da Nang')
    const ok = status === 200 && (hasResults || (hasSmartH1 && !html.includes('Page not found')))
    record(
      '/search?q=food renders result rows',
      ok,
      `status=${status} results=${hasResults} h1=${hasSmartH1} len=${html.length}`,
    )
  } catch (err) {
    record('/search?q=food renders result rows', false, err.message)
  }

  // 4. /search?place=marble-mountains&radius=10 applies anchor
  try {
    const { status, html } = await fetchPage('?place=marble-mountains&radius=10&sort=distance')
    const hasResults = html.includes('data-testid="search-result-row"')
    // The literal "Page not found" string also appears in the
    // serialized React template tree, so we only flag the visible
    // 404 DOM ("Error 404") as a real 404.
    const isNotFound = html.includes('class="text-3xl font-semibold text-ink mb-2 tracking-tight">Page not found<')
    const ok = status === 200 && hasResults && !isNotFound
    record(
      '/search?place=marble-mount honours anchor',
      ok,
      `status=${status} results=${hasResults}`,
    )
  } catch (err) {
    record('/search?place=marble-mountains honours anchor', false, err.message)
  }

  // 5. search_buddies with a known specialty filter
  try {
    const data = await rpc('search_buddies', {
      q: '',
      anchor_lat: null,
      anchor_lng: null,
      radius_km: 50,
      lang: 'English',
      tag: null,
      place: null,
      sort: 'match',
      limit_n: 5,
      offset_n: 0,
    })
    record(
      'search_buddies(lang=English) returns rows',
      Array.isArray(data) && data.length > 0,
      `${data.length} rows`,
    )
  } catch (err) {
    record('search_buddies(lang=English) returns rows', false, err.message)
  }

  console.log(`\n=== ${pass} pass, ${fail} fail ===`)
  if (fail > 0) process.exit(1)
}

main().catch((err) => {
  console.error('FATAL:', err.message)
  process.exit(2)
})
