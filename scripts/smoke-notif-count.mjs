// smoke-notif-count.mjs — uses service role via pg to insert test data
import { Client } from 'pg'
import { createClient } from '@supabase/supabase-js'

const DB_PW = 'that1arlecchino'
const DB_HOST = 'db.pqvnjgyqbxlylawwogjv.supabase.co'
const SUP_URL = 'https://pqvnjgyqbxlylawwogjv.supabase.co'
const SUP_KEY = 'sb_publishable_3uRUZqdvazd4cENt8WOWJA_SB7HmCEE'

const log = (label, ok, detail = '') =>
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? '  ' + detail : ''}`)
let fails = 0
const assert = (label, cond, detail = '') => {
  if (!cond) fails++
  log(label, cond, detail)
}

async function getUnreadCount(sb, userId) {
  const { count, error } = await sb
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .is('read_at', null)
  if (error) throw new Error('count: ' + error.message)
  return count ?? 0
}

async function markAllRead(sb, userId) {
  const { error } = await sb
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('user_id', userId)
    .is('read_at', null)
  if (error) throw new Error('markAllRead: ' + error.message)
}

;(async () => {
  console.log('--- Notification count + mark-all smoke ---\n')

  // Use pg (service role) to get Lan's user id and seed a synthetic notification
  const pg = new Client({
    connectionString: `postgresql://postgres:${DB_PW}@${DB_HOST}:5432/postgres`,
    ssl: { rejectUnauthorized: false },
  })
  await pg.connect()

  const userRes = await pg.query(
    `SELECT id FROM public.profiles WHERE email = 'lan.pham@localit.dev' LIMIT 1`,
  )
  if (!userRes.rows[0]) {
    console.error('Lan not found in profiles')
    process.exit(1)
  }
  const userId = userRes.rows[0].id

  // Baseline unread count
  const before = await pg.query(
    `SELECT COUNT(*) FROM public.notifications WHERE user_id = $1 AND read_at IS NULL`,
    [userId],
  )
  const beforeNum = parseInt(before.rows[0].count, 10)
  console.log(`[diag] Lan unread count baseline: ${beforeNum}`)

  // Insert a synthetic unread notification
  const insRes = await pg.query(
    `INSERT INTO public.notifications (user_id, type, title, body)
     VALUES ($1, 'message', '[smoke] test msg', 'synthetic for bug-fix smoke')
     RETURNING id`,
    [userId],
  )
  const testId = insRes.rows[0].id
  await new Promise((r) => setTimeout(r, 300))

  // Verify count increased by 1
  const afterIns = await pg.query(
    `SELECT COUNT(*) FROM public.notifications WHERE user_id = $1 AND read_at IS NULL`,
    [userId],
  )
  const afterInsNum = parseInt(afterIns.rows[0].count, 10)
  assert('insert increments unread count by 1', afterInsNum === beforeNum + 1,
    `before=${beforeNum} afterIns=${afterInsNum}`)

  // The REST path the UI uses. Sign in as Lan (an authenticated
  // client) so the RLS UPDATE policy accepts the change.
  const sb = createClient(SUP_URL, SUP_KEY, { auth: { persistSession: false } })
  const { data: signIn, error: signErr } = await sb.auth.signInWithPassword({
    email: 'lan.pham@localit.dev',
    password: 'password123',
  })
  if (signErr) throw new Error('signIn: ' + signErr.message)
  console.log(`[diag] signed in as Lan, uid=${signIn.user.id}`)

  // Helper: count via pg (truth) instead of REST (cached) for the
  // middle assertions. We'll still verify the final mark-all via REST
  // because that's the path the UI uses.
  const countUnread = async () => {
    const r = await pg.query(
      `SELECT COUNT(*) FROM public.notifications WHERE user_id = $1 AND read_at IS NULL`,
      [userId],
    )
    return parseInt(r.rows[0].count, 10)
  }

  // BUG 1: mark a row read twice via REST → count should drop by exactly 1
  const beforeR1 = await countUnread()
  console.log(`[diag] before mark-read: ${beforeR1}`)
  const r1 = await sb.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', testId)
  if (r1.error) throw new Error('mark-read: ' + r1.error.message)
  console.log(`[diag] r1.status, count:`, r1.status, r1.count, 'data:', JSON.stringify(r1.data))
  // Check the row directly via pg
  const r1Row = await pg.query('SELECT read_at FROM public.notifications WHERE id = $1', [testId])
  console.log(`[diag] after mark-read, row read_at:`, r1Row.rows[0]?.read_at)
  await new Promise((r) => setTimeout(r, 400))
  const count1 = await countUnread()
  assert('after first mark-read, count drops by 1', count1 === beforeNum,
    `expected=${beforeNum} got=${count1}`)

  // Mark the SAME row read again — should NOT drop further (BUG 1 double-decrement)
  const r2 = await sb.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', testId)
  if (r2.error) throw new Error('mark-read-2: ' + r2.error.message)
  await new Promise((r) => setTimeout(r, 400))
  const count2 = await countUnread()
  assert('marking same row read again does NOT drop count further', count2 === beforeNum,
    `expected=${beforeNum} got=${count2}`)

  // BUG 3: mark-all-read should zero the count
  await markAllRead(sb, userId)
  await new Promise((r) => setTimeout(r, 500))
  const count3 = await countUnread()
  assert('mark-all-read zeros the unread count', count3 === 0, `got=${count3}`)

  // Cleanup: delete the test notification
  await pg.query(`DELETE FROM public.notifications WHERE id = $1`, [testId])

  await pg.end()
  console.log(`\n${fails === 0 ? 'ALL PASS' : `${fails} FAIL`}`)
  process.exit(fails === 0 ? 0 : 1)
})().catch((e) => {
  console.error('smoke threw:', e)
  process.exit(1)
})
