/**
 * Quick RPC smoke test against Supabase REST. Bypasses the app
 * (no Next.js deploy needed) so we can verify the migration
 * before the vercel deploy.
 */
const PROJECT_URL = 'https://pqvnjgyqbxlylawwogjv.supabase.co'
const ANON_KEY = 'sb_publishable_3uRUZqdvazd4cENt8WOWJA_SB7HmCEE'

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
    throw new Error(`${name} failed: ${res.status} ${text.slice(0, 400)}`)
  }
  return res.json()
}

async function main() {
  console.log('--- search_buddies("food", no anchor) ---')
  const r1 = await rpc('search_buddies', {
    q: 'food', anchor_lat: null, anchor_lng: null, radius_km: 50,
    lang: null, tag: null, place: null, sort: 'match', limit_n: 5, offset_n: 0,
  })
  console.log(`Got ${r1.length} rows`)
  for (const row of r1) {
    console.log(`  ${row.full_name} score=${row.match_score} dist=${row.distance_km} text=${row.text_score} geo=${row.geo_score} tag=${row.tag_score} avail=${row.avail_score}`)
  }

  console.log('\n--- search_buddies with place=marble-mountains, radius=10 ---')
  const r2 = await rpc('search_buddies', {
    q: '', anchor_lat: null, anchor_lng: null, radius_km: 10,
    lang: null, tag: null, place: 'marble-mountains', sort: 'distance', limit_n: 10, offset_n: 0,
  })
  console.log(`Got ${r2.length} rows`)
  for (const row of r2) {
    console.log(`  ${row.full_name} dist=${row.distance_km?.toFixed?.(2)} score=${row.match_score}`)
  }

  console.log('\n--- search_buddies with tag=street-food ---')
  const r3 = await rpc('search_buddies', {
    q: '', anchor_lat: null, anchor_lng: null, radius_km: 50,
    lang: null, tag: 'street-food', place: null, sort: 'match', limit_n: 10, offset_n: 0,
  })
  console.log(`Got ${r3.length} rows`)

  console.log('\n--- search_buddies_facets ---')
  const r4 = await rpc('search_buddies_facets', {
    q: '', lang: null, tag: null, place: null, anchor_lat: null, anchor_lng: null, radius_km: 50,
  })
  console.log(JSON.stringify(r4, null, 2))
}

main().catch(err => {
  console.error('FATAL:', err.message)
  process.exit(1)
})
