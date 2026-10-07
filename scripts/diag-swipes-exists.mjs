const URL = 'https://pqvnjgyqbxlylawwogjv.supabase.co'
const KEY = 'sb_publishable_3uRUZqdvazd4cENt8WOWJA_SB7HmCEE'

const tables = ['swipes', 'matches']
for (const t of tables) {
  const r = await fetch(`${URL}/rest/v1/${t}?select=id&limit=1`, {
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
  })
  const body = await r.text()
  const tag = r.ok ? 'OK' : 'ERR'
  console.log(`[${tag}] ${t}: HTTP ${r.status} -> ${body.slice(0, 200)}`)
}

// Also probe the trigger function via RPC
const fn = await fetch(`${URL}/rest/v1/rpc/detect_match`, {
  method: 'POST',
  headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({}),
})
console.log(`[FN] detect_match: HTTP ${fn.status} -> ${(await fn.text()).slice(0, 200)}`)

// Publication membership
const pub = await fetch(`${URL}/rest/v1/pg_publication_tables?select=tablename&pubname=eq.supabase_realtime`, {
  headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
})
const pubBody = await pub.json().catch(() => null)
console.log(`[PUB] realtime tables: ${JSON.stringify(pubBody)}`)
