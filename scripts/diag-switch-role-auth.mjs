import { createBrowserClient } from '@supabase/ssr'

const url = 'https://pqvnjgyqbxlylawwogjv.supabase.co'
const anonKey = 'sb_publishable_3uRUZqdvazd4cENt8WOWJA_SB7HmCEE'

// Simulate exactly what app/api/profile/switch-role/route.ts does
const c = createBrowserClient(url, anonKey, {
  cookies: {
    getAll() { return [] }, // no cookies on server side
    setAll() {},
  },
})
const { data, error } = await c.auth.getUser()
console.log('--- api-style call (no cookies) ---')
console.log('user:', data.user)
console.log('error:', error?.message)