// Verify the full signup OTP route + login flow end-to-end against
// the canonical production URL. The user reported "không thể sign in
// and sign up" — we need hard evidence of whether either one is
// broken before we touch the code.

const BASE = 'https://localit-nhattoann.vercel.app'

async function http(method, path, body, headers = {}) {
  const init = { method, headers: { 'content-type': 'application/json', ...headers } }
  if (body) init.body = JSON.stringify(body)
  const r = await fetch(BASE + path, init)
  let text = ''
  try {
    text = await r.text()
  } catch {}
  return { status: r.status, text, headers: r.headers }
}

// --- 1. Signup start ---
const stamp = Date.now()
const start = await http('POST', '/api/auth/signup/start', {
  email: `regress-${stamp}@localit-test.dev`,
  fullName: 'Regress',
  phone: '+84000000001',
})
console.log('/api/auth/signup/start ->', start.status)
console.log('  body:', start.text.slice(0, 250))

// --- 2. Login (existing seed account) ---
const login = await http('POST', '/api/auth/signin', {
  email: 'john.doe@example.com',
  password: 'password123',
}, { cookie: '' })
console.log('\n/api/auth/signin ->', login.status)
console.log('  body:', login.text.slice(0, 250))

// --- 3. Direct Supabase /auth/v1/token probe with the same creds ---
const direct = await fetch(
  'https://pqvnjgyqbxlylawwogjv.supabase.co/auth/v1/token?grant_type=password',
  {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      apikey: 'sb_publishable_3uRUZqdvazd4cENt8WOWJA_SB7HmCEE',
    },
    body: JSON.stringify({ email: 'john.doe@example.com', password: 'password123' }),
  },
)
console.log('\nSupabase /auth/v1/token direct ->', direct.status)
console.log('  body:', (await direct.text()).slice(0, 250))

// --- 4. /login page renders ---
const loginPage = await http('GET', '/login')
console.log('\n/login page ->', loginPage.status)
console.log('  html length:', loginPage.text.length)
console.log('  has email input:', /id="email"/.test(loginPage.text))
console.log('  has password input:', /id="password"/.test(loginPage.text))

// --- 5. Register page renders ---
const reg = await http('GET', '/register')
console.log('\n/register page ->', reg.status)
console.log('  html length:', reg.text.length)
console.log('  has name input:', /name="full_name"|id="full_name"|id="name"/.test(reg.text))