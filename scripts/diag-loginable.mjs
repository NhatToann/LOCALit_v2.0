// scripts/diag-loginable.mjs
const candidates = [
  'john.doe@example.com',
  'lan.pham@localit.dev',
  'sarah.m@example.com',
  'e2e-real@autotest.dev',
]
const pw = 'password123'
const sbUrl = 'https://pqvnjgyqbxlylawwogjv.supabase.co'
const sbKey = 'sb_publishable_3uRUZqdvazd4cENt8WOWJA_SB7HmCEE'
for (const email of candidates) {
  const r = await fetch(`${sbUrl}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', apikey: sbKey },
    body: JSON.stringify({ email, password: pw }),
  })
  const j = await r.json()
  if (r.ok) {
    console.log('OK:  ', email, j.user?.id, j.user?.role ?? '(no role)')
  } else {
    console.log('FAIL:', email, j.msg ?? j.code)
  }
}
