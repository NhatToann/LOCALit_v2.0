// Test REST query for safe_profiles
const r = await fetch('https://pqvnjgyqbxlylawwogjv.supabase.co/rest/v1/safe_profiles?select=id,full_name,bio&id=eq.11111111-1111-1111-1111-111111111111', {
  headers: { apikey: 'sb_publishable_3uRUZqdvazd4cENt8WOWJA_SB7HmCEE', authorization: 'Bearer sb_publishable_3uRUZqdvazd4cENt8WOWJA_SB7HmCEE' }
})
console.log('status:', r.status)
console.log('body:', await r.text())
