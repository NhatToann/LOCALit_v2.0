// Compare what Lan vs Phan actually see in the shared conversation.
import pg from 'pg'
const {Client} = pg

const SUPA = 'https://pqvnjgyqbxlylawwogjv.supabase.co'
const ANON = 'sb_publishable_3uRUZqdvazd4cENt8WOWJA_SB7HmCEE'

const CONV = '8c48a631-f230-4622-8c66-5cb1c27e46e7'

async function asUser(email, password) {
  const r = await fetch(`${SUPA}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON, 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  const j = await r.json()
  if (!j.access_token) return { email, error: j.msg || JSON.stringify(j).slice(0, 120) }
  const h = { apikey: ANON, authorization: `Bearer ${j.access_token}` }
  const msgs = await fetch(
    `${SUPA}/rest/v1/messages?conversation_id=eq.${CONV}&select=id,sender_id,content,created_at,deleted_at&order=created_at`,
    { headers: h },
  ).then(x => x.json())
  return { email, uid: j.user.id, msgs: Array.isArray(msgs) ? msgs : msgs }
}

const main = async () => {
  const lan = await asUser('lan.pham@localit.dev', 'password123')
  console.log('=== Lan Pham ===')
  if (lan.error) { console.log('  ERROR:', lan.error) } else {
    console.log(`  uid=${lan.uid}  sees ${lan.msgs.length} messages`)
    const visible = lan.msgs.filter(m => !m.deleted_at)
    console.log(`  non-deleted: ${visible.length}`)
    visible.slice(-6).forEach(m => console.log(`    [${m.created_at.slice(11,19)}] ${m.sender_id.slice(0,8)}: ${String(m.content).slice(0,45)}`))
  }

  console.log('\n=== DB truth ===')
  const c = new Client({ connectionString:'postgresql://postgres:that1arlecchino@db.pqvnjgyqbxlylawwogjv.supabase.co:5432/postgres', ssl:{rejectUnauthorized:false} })
  await c.connect()
  const all = await c.query(
    `SELECT id, sender_id, content, created_at, deleted_at
     FROM public.messages WHERE conversation_id = $1 ORDER BY created_at`,
    [CONV],
  )
  console.log(`  total rows: ${all.rows.length}, non-deleted: ${all.rows.filter(r=>!r.deleted_at).length}`)
  all.rows.slice(-6).forEach(r => console.log(`    [${r.created_at.toISOString().slice(11,19)}] ${r.sender_id.slice(0,8)}: ${String(r.content).slice(0,45)}`))

  // Conversation participants
  const conv = await c.query(`SELECT tourist_id, buddy_id FROM public.conversations WHERE id = $1`, [CONV])
  console.log('\n=== Conversation participants ===')
  const p = conv.rows[0]
  const prof = await c.query(`SELECT id, full_name, email, role FROM public.profiles WHERE id = ANY($1)`, [[p.tourist_id, p.buddy_id]])
  prof.rows.forEach(r => console.log(`  ${r.id.slice(0,8)} | ${r.full_name} | ${r.email} | ${r.role}`))

  await c.end()
}

main().catch(e => { console.error(e); process.exit(1) })