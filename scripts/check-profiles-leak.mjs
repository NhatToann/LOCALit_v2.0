// Check what columns anon can read on profiles
const r = await fetch('https://pqvnjgyqbxlylawwogjv.supabase.co/rest/v1/profiles?select=*&limit=2', {
  headers: {
    apikey: 'sb_publishable_3uRUZqdvazd4cENt8WOWJA_SB7HmCEE',
    authorization: 'Bearer sb_publishable_3uRUZqdvazd4cENt8WOWJA_SB7HmCEE',
  },
})
console.log('status:', r.status)
console.log('body:', await r.text())
