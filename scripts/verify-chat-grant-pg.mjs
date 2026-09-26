// Verify the chat INSERT grant fix using the postgres role (closest to the
// authenticated role's permissions for this GRANT check — Postgres role has
// SELECT/INSERT/UPDATE/DELETE on messages which is now also true for
// authenticated).
//
// We also simulate the authenticated role using SET ROLE to confirm the
// INSERT path that the actual Next.js client takes will succeed.

import { Client } from 'pg'
const c = new Client({
  host: 'db.pqvnjgyqbxlylawwogjv.supabase.co',
  port: 5432,
  user: 'postgres',
  password: 'that1arlecchino',
  database: 'postgres',
  ssl: { rejectUnauthorized: false },
})

async function main() {
  await c.connect()

  // Use seed tourist + seed buddy + an existing or new conversation
  const touristId = 'aaaa1111-1111-1111-1111-111111111111' // John Doe
  const buddyId = '11111111-1111-1111-1111-111111111111' // Lan Pham

  // Find existing conversation
  let r = await c.query(
    `SELECT id FROM public.conversations WHERE tourist_id=$1 AND buddy_id=$2 LIMIT 1`,
    [touristId, buddyId],
  )
  let convoId
  if (r.rows.length === 0) {
    r = await c.query(
      `INSERT INTO public.conversations (tourist_id, buddy_id) VALUES ($1, $2) RETURNING id`,
      [touristId, buddyId],
    )
  }
  convoId = r.rows[0].id
  console.log('Conversation:', convoId)

  // Simulate authenticated role inserting a message
  // (The GRANT applies to ALL authenticated sessions, so any one will work.)
  await c.query(`SET ROLE authenticated`)

  // Set the JWT context so auth.uid() returns John's id (this is what
  // postgrest does on every API request). The RLS policy requires
  // auth.uid() = sender_id.
  await c.query(`SELECT set_config('request.jwt.claim.sub', $1, true)`, [touristId])
  await c.query(`SELECT set_config('role.authenticated', 'authenticated', true)`)

  const probe = `Smoke test message @ ${new Date().toISOString()}`
  const ins = await c.query(
    `INSERT INTO public.messages (conversation_id, sender_id, content)
     VALUES ($1, $2, $3)
     RETURNING id, content, created_at`,
    [convoId, touristId, probe],
  )
  const msgId = ins.rows[0].id
  console.log('INSERT OK:', msgId, ins.rows[0].content)

  // SELECT-back check
  const sel = await c.query(
    `SELECT id, content FROM public.messages WHERE id=$1`,
    [msgId],
  )
  console.log('SELECT OK:', sel.rows[0].content)

  // Reset role and clean up
  await c.query(`RESET ROLE`)
  await c.query(`DELETE FROM public.messages WHERE id=$1`, [msgId])
  console.log('✓ Chat permission denied bug is FIXED — authenticated role can INSERT + SELECT on messages.')

  await c.end()
}

main().catch(e => { console.error('FAIL:', e.message); process.exit(1) })
