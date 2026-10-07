// Check what swipe rows exist for the user "Lan Pham"
// (find by full_name) and which buddies are in safe_buddies
// so we can confirm overlap.

const URL = 'https://pqvnjgyqbxlylawwogjv.supabase.co'
const ANON = 'sb_publishable_3uRUZqdvazd4cENt8WOWJA_SB7HmCEE'

// We can't query auth.users as anon, but we CAN query the
// swipes table as authenticated if we have a session. Without
// a session, swipes is empty for us. Try anyway.
const r = await fetch(`${URL}/rest/v1/swipes?select=*&limit=50`, {
  headers: { apikey: ANON, Authorization: `Bearer ${ANON}` },
})
console.log('swipes as anon:', r.status)
console.log('body:', (await r.text()).slice(0, 600))

// Also dump safe_buddies order to see what deck order is expected
const r2 = await fetch(`${URL}/rest/v1/safe_buddies?select=id&limit=50`, {
  headers: { apikey: ANON, Authorization: `Bearer ${ANON}` },
})
const buddies = await r2.json()
console.log('safe_buddies:', buddies.length, 'rows')
for (const b of buddies) console.log(' ', b.id)