const URL = 'https://pqvnjgyqbxlylawwogjv.supabase.co'
const ANON = 'sb_publishable_3uRUZqdvazd4cENt8WOWJA_SB7HmCEE'

// Anon can't SELECT, but safe_buddies view is SELECT to anon.
// Query as anon and look for the seeded Lan Pham row. Then check
// is_available. If anon can see it, that proves the view exposes her.

const r = await fetch(
  `${URL}/rest/v1/safe_buddies?select=id,location_city,specialties,is_available&location_city=ilike.*nang*&limit=20`,
  { headers: { apikey: ANON, Authorization: `Bearer ${ANON}` } },
)
console.log('status', r.status)
const data = await r.json()
console.log('rows:', data.length)
for (const row of data) {
  console.log(JSON.stringify(row))
}
