// Sign in as Lan Pham via the auth API, then query messages in conv 8c48a631
import pg from 'pg'
const {Client} = pg

const SUPA_URL = 'https://pqvnjgyqbxlylawwogjv.supabase.co'
const ANON = 'sb_publishable_3uRUZqdvazd4cENt8WOWJA_SB7HmCEE'
const CONV = '8c48a631-f230-4622-8c66-5cb1c27e46e7'

const main = async () => {
  // 1) Sign in
  const res = await fetch(`${SUPA_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON, 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'lan.pham@localit.dev', password: 'password123' }),
  })
  const auth = await res.json()
  if (!auth.access_token) {
    console.log('LOGIN FAILED', JSON.stringify(auth).slice(0, 300))
    process.exit(1)
  }
  console.log('Logged in as:', auth.user.email, 'uid=', auth.user.id)

  const h = { apikey: ANON, authorization: `Bearer ${auth.access_token}` }

  // 2) Query conversations visible to Lan
  const convs = await fetch(`${SUPA_URL}/rest/v1/conversations?select=id,tourist_id,buddy_id&order=created_at`, { headers: h }).then(r => r.json())
  console.log(`\nConversations visible to Lan: ${Array.isArray(convs) ? convs.length : JSON.stringify(convs).slice(0,200)}`)
  if (Array.isArray(convs)) convs.forEach(c => console.log(`  ${c.id.slice(0,8)} | tourist=${c.tourist_id.slice(0,8)} buddy=${c.buddy_id.slice(0,8)}`))

  // 3) Query messages in the Phan↔Lan conv
  const msgs = await fetch(`${SUPA_URL}/rest/v1/messages?conversation_id=eq.${CONV}&select=id,content,created_at&order=created_at`, { headers: h }).then(r => r.json())
  console.log(`\nMessages in conv ${CONV.slice(0,8)} visible to Lan: ${Array.isArray(msgs) ? msgs.length : JSON.stringify(msgs).slice(0,300)}`)
  if (Array.isArray(msgs)) msgs.slice(-5).forEach(m => console.log(`  [${m.created_at}] ${m.content?.slice(0,50)}`))

  // 4) Count via the RPC-free path: count all messages visible to Lan
  const all = await fetch(`${SUPA_URL}/rest/v1/messages?select=id,conversation_id&limit=100`, { headers: h }).then(r => r.json())
  console.log(`\nTotal messages visible to Lan (all convs): ${Array.isArray(all) ? all.length : JSON.stringify(all).slice(0,200)}`)
  if (Array.isArray(all)) {
    const byConv = {}
    for (const m of all) byConv[m.conversation_id.slice(0,8)] = (byConv[m.conversation_id.slice(0,8)]||0)+1
    console.log('  by conv:', JSON.stringify(byConv))
  }

  // 5) Direct DB count for comparison
  const c = new Client({ connectionString:'postgresql://postgres:that1arlecchino@db.pqvnjgyqbxlylawwogjv.supabase.co:5432/postgres', ssl:{rejectUnauthorized:false} })
  await c.connect()
  const dbAll = await c.query('SELECT conversation_id, COUNT(*) FROM public.messages WHERE conversation_id = $1 GROUP BY 1', [CONV])
  console.log('\nDB truth for conv:', dbAll.rows)
  await c.end()
}

main().catch(e => { console.error(e); process.exit(1) })