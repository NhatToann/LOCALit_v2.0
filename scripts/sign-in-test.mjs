import { writeFileSync } from 'fs'

const SUPABASE_URL = 'https://pqvnjgyqbxlylawwogjv.supabase.co'
const ANON_KEY = 'sb_publishable_3uRUZqdvazd4cENt8WOWJA_SB7HmCEE'

const email = process.argv[2] ?? 'e2e-final@autotest.dev'
const password = process.argv[3] ?? 'Test1234!@#$'

const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', apikey: ANON_KEY },
  body: JSON.stringify({ email, password }),
})
const text = await res.text()
writeFileSync('signin-output.json', text)
console.log(`status=${res.status} bytes=${text.length} saved to signin-output.json`)
process.exit(0)