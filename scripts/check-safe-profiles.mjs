// Check safe_profiles view works for anon
const r = await fetch('https://pqvnjgyqbxlylawwogjv.supabase.co/rest/v1/safe_profiles?select=*&limit=2', {
  headers: {
    apikey: 'sb_publishable_3uRUZqdvazd4cENt8WOWJA_SB7HmCEE',
    authorization: 'Bearer sb_publishable_3uRUZqdvazd4cENt8WOWJA_SB7HmCEE',
  },
})
console.log('safe_profiles status:', r.status)
console.log('safe_profiles body:', (await r.text()).slice(0, 500))
