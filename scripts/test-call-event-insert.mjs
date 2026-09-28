// scripts/test-call-event-insert.mjs
// Smoke test: insert a 'call_event' row directly via pg, then delete it.
// Bypasses service_role key requirement (we have DB password).
import pg from 'pg'
const { Client } = pg

const url = process.env.SUPABASE_URL
const pw = process.env.SUPABASE_DB_PASSWORD
if (!url || !pw) { console.error('Set env.'); process.exit(1) }
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
const host = `${new URL(url).hostname.split('.')[0]}.supabase.co`
const c = new Client({
  connectionString: `postgresql://postgres:${pw}@db.${host}:5432/postgres`,
  ssl: { rejectUnauthorized: false },
})
await c.connect()
try {
  const conv = await c.query(`SELECT id, tourist_id, buddy_id FROM public.conversations LIMIT 1`)
  if (conv.rows.length === 0) {
    console.error('No conversation in DB to test against.')
    process.exit(1)
  }
  const { id: convId, tourist_id } = conv.rows[0]
  console.log('Using conversation:', convId)

  const ins = await c.query(
    `INSERT INTO public.messages
       (conversation_id, sender_id, content, message_type, metadata)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, message_type, content`,
    [convId, tourist_id, '📞 Voice call · test smoke', 'call_event', { duration_seconds: 0, _test: true }],
  )
  console.log('Inserted:', ins.rows[0])

  const del = await c.query(`DELETE FROM public.messages WHERE id = $1`, [ins.rows[0].id])
  console.log(`Cleanup: deleted ${del.rowCount} row(s)`)
  console.log('PASS: call_event insert works against the live DB.')
} catch (e) {
  console.error('FAIL:', e.message)
  process.exit(1)
} finally { await c.end() }
