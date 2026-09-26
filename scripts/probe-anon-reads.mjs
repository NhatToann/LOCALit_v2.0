// Probe anon reads with explicit column lists matching the grants
const SUPA = 'https://pqvnjgyqbxlylawwogjv.supabase.co'
const ANON = 'sb_publishable_3uRUZqdvazd4cENt8WOWJA_SB7HmCEE'

async function read(table, select = '*') {
  const url = `${SUPA}/rest/v1/${table}?select=${encodeURIComponent(select)}&limit=2`
  const r = await fetch(url, { headers: { apikey: ANON, authorization: `Bearer ${ANON}` } })
  const text = await r.text()
  return { status: r.status, text: text.slice(0, 400) }
}

console.log('--- ANON-ONLY PROBE ---')
console.log('tourists (granted cols):', JSON.stringify(await read('tourists', 'id,nationality,travel_style,interests,languages,budget_range,arrival_date,destination,is_visible,created_at,updated_at')))
console.log('buddies (granted cols):', JSON.stringify(await read('buddies', 'id,location_city,languages,specialties,hourly_rate,is_available,rating_avg')))
console.log('reviews (granted cols):', JSON.stringify(await read('reviews', 'id,trip_id,rating,comment,created_at')))
console.log('tourists with DOB (forbidden col):', JSON.stringify(await read('tourists', 'id,date_of_birth')))
console.log('buddies with bio (forbidden col):', JSON.stringify(await read('buddies', 'id,bio')))
