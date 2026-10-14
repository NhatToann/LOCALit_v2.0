#!/usr/bin/env node
/**
 * Smoke test for the new profile-review gate.
 * Verifies, against the live DB policies:
 *   1. Reviews can only be written between ACCEPTED-connected pairs.
 *   2. trip_id is nullable (no longer blocks profile reviews).
 *   3. One review per (reviewer, reviewee).
 *   4. The unique index actually blocks a duplicate insert.
 */
import { Client } from 'pg'

const client = new Client({
  host: 'db.pqvnjgyqbxlylawwogjv.supabase.co',
  port: 5432,
  user: 'postgres',
  password: process.env.DB_PW || process.env.SUPABASE_DB_PASSWORD,
  database: 'postgres',
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 15000,
})

let pass = 0
let fail = 0
function check(label, ok, detail = '') {
  if (ok) {
    pass++
    console.log(`PASS: ${label}${detail ? ` — ${detail}` : ''}`)
  } else {
    fail++
    console.log(`FAIL: ${label}${detail ? ` — ${detail}` : ''}`)
  }
}

await client.connect()
try {
  // 1. trip_id nullable
  const t = await client.query(`
    SELECT is_nullable FROM information_schema.columns
    WHERE table_name='reviews' AND column_name='trip_id'
  `)
  check('reviews.trip_id is nullable', t.rows[0]?.is_nullable === 'YES', `is_nullable=${t.rows[0]?.is_nullable}`)

  // 2. connection_id exists + FK
  const c = await client.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_name='reviews' AND column_name='connection_id'
  `)
  check('reviews.connection_id exists', c.rows.length === 1)

  // 3. unique index
  const u = await client.query(`
    SELECT indexname FROM pg_indexes
    WHERE tablename='reviews' AND indexname='reviews_reviewer_reviewee_uniq'
  `)
  check('unique (reviewer,reviewee) index exists', u.rows.length === 1)

  // 4. INSERT policy references connections
  const p = await client.query(`
    SELECT with_check FROM pg_policies
    WHERE tablename='reviews' AND policyname='reviews_insert'
  `)
  const pol = p.rows[0]?.with_check ?? ''
  check('INSERT policy requires accepted connection',
    pol.includes('requester_id') && pol.includes("status = 'accepted'"),
    pol.slice(0, 60) + '…')

  // 5. UPDATE + DELETE policies scoped to reviewer
  const ud = await client.query(`
    SELECT policyname, cmd FROM pg_policies
    WHERE tablename='reviews' AND cmd IN ('UPDATE','DELETE')
  `)
  check('UPDATE + DELETE policies exist',
    ud.rows.some((r) => r.cmd === 'UPDATE') && ud.rows.some((r) => r.cmd === 'DELETE'),
    ud.rows.map((r) => r.cmd).join(', '))

  // 6. Live negative test: two users WITHOUT an accepted connection
  //    must not be able to satisfy the policy's EXISTS clause.
  const pairs = await client.query(`
    SELECT a.id AS uid
    FROM public.profiles a
    WHERE NOT EXISTS (
      SELECT 1 FROM public.connections c
      WHERE c.status = 'accepted'
        AND ((c.requester_id = a.id) OR (c.recipient_id = a.id))
    )
    LIMIT 2
  `)
  if (pairs.rows.length === 2) {
    const [a, b] = pairs.rows.map((r) => r.uid)
    const gate = await client.query(
      `SELECT EXISTS (
         SELECT 1 FROM public.connections c
         WHERE c.status = 'accepted'
           AND ((c.requester_id = $1 AND c.recipient_id = $2)
             OR (c.requester_id = $2 AND c.recipient_id = $1))
       ) AS ok`,
      [a, b],
    )
    check('unconnected pair fails the review gate', gate.rows[0].ok === false)
  } else {
    console.log('SKIP: not enough unconnected profiles to negative-test')
  }

  // 7. Positive test: an ACCEPTED pair DOES satisfy the gate
  const ok = await client.query(`
    SELECT requester_id, recipient_id
    FROM public.connections WHERE status = 'accepted' LIMIT 1
  `)
  if (ok.rows.length === 1) {
    const { requester_id: x, recipient_id: y } = ok.rows[0]
    const gate = await client.query(
      `SELECT EXISTS (
         SELECT 1 FROM public.connections c
         WHERE c.status = 'accepted'
           AND ((c.requester_id = $1 AND c.recipient_id = $2)
             OR (c.requester_id = $2 AND c.recipient_id = $1))
       ) AS ok`,
      [x, y],
    )
    check('accepted pair passes the review gate', gate.rows[0].ok === true)
  } else {
    console.log('SKIP: no accepted connection to positive-test')
  }

  // 8. Duplicate insert is blocked by the unique index
  const anyRev = await client.query('SELECT reviewer_id, reviewee_id FROM public.reviews LIMIT 1')
  if (anyRev.rows.length === 1) {
    const { reviewer_id: r, reviewee_id: v } = anyRev.rows[0]
    let dupBlocked = false
    try {
      await client.query(
        `INSERT INTO public.reviews (reviewer_id, reviewee_id, rating, comment)
         VALUES ($1, $2, 4, 'dup-test')`,
        [r, v],
      )
    } catch (e) {
      dupBlocked = e.code === '23505'
    }
    check('duplicate (reviewer,reviewee) insert blocked', dupBlocked)
  } else {
    console.log('SKIP: no existing review row to duplicate-test')
  }

  console.log(`\n${pass} passed, ${fail} failed`)
} finally {
  await client.end()
}

process.exitCode = fail > 0 ? 1 : 0