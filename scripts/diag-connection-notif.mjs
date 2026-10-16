// diag-connection-notif.mjs — investigate why connection requests don't create notifications
import { Client } from 'pg'

const c = new Client({
  connectionString: 'postgresql://postgres:that1arlecchino@db.pqvnjgyqbxlylawwogjv.supabase.co:5432/postgres',
  ssl: { rejectUnauthorized: false },
})

const log = (label, rows) => {
  console.log(`\n=== ${label} (${rows.length}) ===`)
  console.table(rows)
}

await c.connect()
try {
  log('triggers on public.connections',
    (await c.query("SELECT tgname, tgenabled FROM pg_trigger WHERE tgrelid='public.connections'::regclass AND NOT tgisinternal")).rows)

  log('notify functions in public',
    (await c.query("SELECT proname, prosecdef, prosecdef IS TRUE AS is_security_definer FROM pg_proc WHERE proname LIKE 'notify_%' AND pronamespace='public'::regnamespace")).rows)

  log('10 most recent notifications',
    (await c.query("SELECT id, user_id, type, title, link, read_at IS NOT NULL AS is_read, created_at FROM public.notifications ORDER BY created_at DESC LIMIT 10")).rows)

  log('RLS on notifications',
    (await c.query("SELECT policyname, roles::text, cmd, qual IS NOT NULL AS has_using FROM pg_policies WHERE schemaname='public' AND tablename='notifications'")).rows)

  log('grants on notifications',
    (await c.query("SELECT grantee, privilege_type FROM information_schema.table_privileges WHERE table_schema='public' AND table_name='notifications' ORDER BY grantee, privilege_type")).rows)

  log('connections in last 24h',
    (await c.query("SELECT id, requester_id, recipient_id, status, created_at FROM public.connections WHERE created_at > now() - interval '24 hours' ORDER BY created_at DESC LIMIT 10")).rows)

  log('count of connection_request notifications ever',
    (await c.query("SELECT type, count(*)::int AS n FROM public.notifications GROUP BY type ORDER BY n DESC")).rows)

  // Try INSERT a test connection to see if trigger fires
  console.log('\n=== TRYING LIVE TRIGGER TEST ===')
  // Find two seed users (any profiles with a buddy/tourist row)
  const u = await c.query("SELECT p.id, p.role FROM public.profiles p WHERE p.email IN ('john.doe@example.com','lan.pham@localit.dev') ORDER BY p.email")
  console.log('seed users:', u.rows)
  if (u.rows.length < 2) {
    console.log('cannot test — need both seed users')
  } else {
    const requester = u.rows.find(r => r.role === 'tourist') ?? u.rows[0]
    const recipient = u.rows.find(r => r.id !== requester.id) ?? u.rows[1]
    console.log(`using requester=${requester.id} (${requester.role}) recipient=${recipient.id} (${recipient.role})`)

    // Snapshot notification count for recipient BEFORE
    const beforeQ = await c.query("SELECT count(*)::int AS n FROM public.notifications WHERE user_id=$1 AND type='connection_request'", [recipient.id])
    const beforeN = beforeQ.rows[0].n
    console.log(`recipient's connection_request notifications BEFORE: ${beforeN}`)

    // Clean any prior test connection between these two
    await c.query("DELETE FROM public.connections WHERE requester_id=$1 AND recipient_id=$2", [requester.id, recipient.id])

    // Try a direct INSERT
    const ins = await c.query(
      `INSERT INTO public.connections (requester_id, recipient_id, requester_role, recipient_role, status, duration_days)
       VALUES ($1, $2, $3, $4, 'pending', 7)
       RETURNING id, status, created_at`,
      [requester.id, recipient.id, requester.role, recipient.role]
    )
    console.log('inserted connection:', ins.rows[0])

    // Snapshot AFTER
    const afterQ = await c.query("SELECT count(*)::int AS n FROM public.notifications WHERE user_id=$1 AND type='connection_request'", [recipient.id])
    const afterN = afterQ.rows[0].n
    console.log(`recipient's connection_request notifications AFTER: ${afterN}`)
    console.log(`DELTA: ${afterN - beforeN} (expected: 1)`)

    if (afterN > beforeN) {
      const newest = await c.query(
        "SELECT id, type, title, link, actor_id, actor_name, created_at FROM public.notifications WHERE user_id=$1 AND type='connection_request' ORDER BY created_at DESC LIMIT 1",
        [recipient.id]
      )
      console.log('newest notification:', newest.rows[0])
    } else {
      console.log('!!! TRIGGER DID NOT FIRE OR RLS BLOCKED INSERT !!!')
    }

    // Cleanup
    await c.query("DELETE FROM public.connections WHERE id=$1", [ins.rows[0].id])
    if (afterN > beforeN) {
      // clean the test notification too
      await c.query("DELETE FROM public.notifications WHERE user_id=$1 AND type='connection_request' AND title LIKE 'Test%'", [recipient.id])
    }
  }
} catch (e) {
  console.error('ERR:', e.message)
  console.error(e.stack)
} finally {
  await c.end()
}
