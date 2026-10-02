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
  const res = await fetch(`${PROD_URL}/search${qs}`, {
    headers: { Accept: 'text/html' },
    redirect: 'follow',
  })
  return { status: res.status, html: await res.text() }
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
    record('/search?q=food renders result rows', status === 200 && hasResults, `status=${status}`)
  } catch (err) {
    record('/search?q=food renders result rows', false, err.message)
  }

  // 4. /search?place=marble-mountains&radius=10 applies anchor
  try {
    const { status, html } = await fetchPage('?place=marble-mountains&radius=10&sort=distance')
    const ok = status === 200 && !html.includes('No buddies matched')
    record(
      '/search?place=marble-mount honours anchor',
      ok,
      `status=${status}`,
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
      lang: null,
      tag: 'street-food',
      place: null,
      sort: 'match',
      limit_n: 5,
      offset_n: 0,
    })
    record(
      'search_buddies(tag=street-food) returns rows',
      Array.isArray(data) && data.length > 0,
      `${data.length} rows`,
    )
  } catch (err) {
    record('search_buddies(tag=street-food) returns rows', false, err.message)
  }

  console.log(`\n=== ${pass} pass, ${fail} fail ===`)
  if (fail > 0) process.exit(1)
}

main().catch((err) => {
  console.error('FATAL:', err.message)
  process.exit(2)
})
