const URL = 'https://pqvnjgyqbxlylawwogjv.supabase.co'
const ANON = 'sb_publishable_3uRUZqdvazd4cENt8WOWJA_SB7HmCEE'

// Ask PostgREST for a row with id=eq.<lan pham's id> in safe_buddies
// BUT we don't know her id. So instead: query a unique buddy id we
// DO know (22222222) to confirm the view still works for that id, and
// then call the queue API with a fabricated bearer token that's NOT
// signed in to confirm the route returns 401 (sanity).

const r1 = await fetch(
  `${URL}/rest/v1/safe_buddies?select=id,is_available,latitude,longitude&limit=10`,
  { headers: { apikey: ANON, Authorization: `Bearer ${ANON}` } },
)
console.log('safe_buddies anon rows:', r1.status)
const data = await r1.json()
console.log('count:', data.length)
for (const row of data) {
  console.log(' ', row)
}

// Now check the view's metadata by hitting OpenAPI
const r2 = await fetch(`${URL}/rest/v1/`, { headers: { apikey: ANON, Authorization: `Bearer ${ANON}` } })
const openapi = await r2.json()
const sb = openapi.definitions?.safe_buddies
if (sb) {
  console.log('safe_buddies OpenAPI columns:')
  for (const [name, def] of Object.entries(sb.properties ?? {})) {
    console.log(' ', name, '=', def.type ?? def.format)
  }
}
