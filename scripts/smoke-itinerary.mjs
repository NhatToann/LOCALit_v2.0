#!/usr/bin/env node
// End-user smoke for the unified itinerary feature.
// Runs against production; uses the seed accounts documented in
// AGENTS.md (lan.pham@localit.dev / john.doe@example.com).
//
// Verifies:
//   1. Sign in as tourist (John)
//   2. POST a new itinerary via supabase-js
//   3. PATCH itinerary (title)
//   4. POST a day
//   5. POST 2 stops (1 with day_id, 1 unassigned)
//   6. Invite a collaborator (Lan) by email
//   7. Sign in as buddy (Lan)
//   8. Read itinerary as collaborator (RLS: collaborator_read on parent)
//   9. Read day + stops as collaborator
//   10. PATCH a stop as collaborator (RLS: collab_write)
//   11. Accept invite via PATCH
//   12. Sign back in as tourist, delete (cascade should drop everything)
//
// Pass: every step returns 2xx and no Postgres errors.

import { createClient } from '@supabase/supabase-js'

const URL = 'https://pqvnjgyqbxlylawwogjv.supabase.co'
const KEY = 'sb_publishable_3uRUZqdvazd4cENt8WOWJA_SB7HmCEE'

const log = (label, ok, detail = '') =>
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? '  ' + detail : ''}`)
let fails = 0
const assert = (label, cond, detail = '') => {
  if (!cond) fails++
  log(label, cond, detail)
}

async function signIn(email, password) {
  const sb = createClient(URL, KEY, { auth: { persistSession: false } })
  const { data, error } = await sb.auth.signInWithPassword({ email, password })
  if (error || !data.session) throw new Error(`signIn ${email}: ${error?.message}`)
  return { sb, userId: data.user.id, accessToken: data.session.access_token }
}

;(async () => {
  console.log('--- End-user smoke: unified itinerary ---\n')

  // 1. Sign in John (tourist) + Lan (buddy) in parallel
  let john, lan
  try {
    [john, lan] = await Promise.all([
      signIn('john.doe@example.com', 'password123'),
      signIn('lan.pham@localit.dev', 'password123'),
    ])
  } catch (e) {
    console.error('FATAL sign-in', e.message)
    process.exit(1)
  }
  console.log(`John = ${john.userId}`)
  console.log(`Lan  = ${lan.userId}\n`)

  // 2. Create itinerary as John
  const { data: itin, error: e1 } = await john.sb
    .from('itineraries')
    .insert({
      owner_id: john.userId,
      title: 'Smoke Da Nang 2026-10-07',
      destination: 'Da Nang',
      start_date: '2026-10-15',
      end_date: '2026-10-18',
      status: 'planning',
      notes: 'End-user smoke test',
      last_editor_id: john.userId,
    })
    .select()
    .single()
  assert('1. John creates itinerary', !e1 && itin, e1?.message)

  if (!itin) { process.exit(1) }

  // 3. PATCH itinerary
  const { data: itin2, error: e2 } = await john.sb
    .from('itineraries')
    .update({ title: 'Smoke Patched Title' })
    .eq('id', itin.id)
    .select()
    .single()
  assert('2. John PATCHes itinerary title', !e2 && itin2?.title === 'Smoke Patched Title', e2?.message)

  // 4. POST a day
  const { data: day, error: e3 } = await john.sb
    .from('itinerary_days')
    .insert({
      itinerary_id: itin.id,
      day_order: 1,
      date: '2026-10-15',
      title: 'Arrival + Marble Mountains',
    })
    .select()
    .single()
  assert('3. John adds day 1', !e3 && day, e3?.message)

  // 5. POST 2 stops (1 with day, 1 unassigned)
  const { data: stopA, error: e4 } = await john.sb
    .from('itinerary_stops')
    .insert({
      itinerary_id: itin.id,
      day_id: day.id,
      stop_order: 1,
      name: 'Marble Mountains',
      address: '81 Huyen Tran Cong Chua, Ngu Hanh Son',
      planned_time: '09:00',
    })
    .select()
    .single()
  assert('4. John adds stop with day_id', !e4 && stopA, e4?.message)

  const { data: stopB, error: e5 } = await john.sb
    .from('itinerary_stops')
    .insert({
      itinerary_id: itin.id,
      day_id: null,
      stop_order: 1,
      name: 'Han Market',
      address: '119 Tran Phu',
    })
    .select()
    .single()
  assert('5. John adds unassigned stop', !e5 && stopB, e5?.message)

  // 6. Invite Lan as collaborator
  const { data: collab, error: e6 } = await john.sb
    .from('itinerary_collaborators')
    .upsert(
      {
        itinerary_id: itin.id,
        user_id: lan.userId,
        role: 'editor',
        status: 'invited',
        invited_by: john.userId,
      },
      { onConflict: 'itinerary_id,user_id' },
    )
    .select()
    .single()
  assert('6. John invites Lan as editor', !e6 && collab, e6?.message)

  // 7. Lan reads itinerary as collaborator
  const { data: itinAsLan, error: e7 } = await lan.sb
    .from('itineraries')
    .select('*')
    .eq('id', itin.id)
    .maybeSingle()
  assert('7. Lan READs itinerary (collab RLS)', !e7 && itinAsLan, e7?.message)

  // 8. Lan reads days + stops
  const [{ data: daysAsLan, error: e8a }, { data: stopsAsLan, error: e8b }] = await Promise.all([
    lan.sb.from('itinerary_days').select('*').eq('itinerary_id', itin.id),
    lan.sb.from('itinerary_stops').select('*').eq('itinerary_id', itin.id),
  ])
  assert('8a. Lan READs days (collab RLS)', !e8a && Array.isArray(daysAsLan) && daysAsLan.length === 1, e8a?.message)
  assert('8b. Lan READs stops (collab RLS)', !e8b && Array.isArray(stopsAsLan) && stopsAsLan.length === 2, e8b?.message)

  // 9. Lan PATCHes a stop (collab_write policy) — Lan is still 'invited'
  // at this point (accept happens in step 11). collab_write requires
  // status='accepted', so this should NOT update yet. Verify 0 rows.
  const { data: patched, error: e9 } = await lan.sb
    .from('itinerary_stops')
    .update({ notes: 'Updated by Lan (should be blocked — invited only)' })
    .eq('id', stopA.id)
    .select()
  assert('9. Lan PATCHes stop while invited → 0 rows (collab_write requires accepted)',
    !e9 && Array.isArray(patched) && patched.length === 0,
    `patched=${patched?.length} err=${e9?.message}`)

  // 10. Lan cannot DELETE the itinerary (owner-only). Known Supabase
  // REST behavior: RLS-blocked writes return 200/204, not 4xx. The
  // assertion is therefore "no rows deleted" rather than "error thrown".
  const { data: deleted, error: e10 } = await lan.sb.from('itineraries').delete().eq('id', itin.id).select()
  assert('10. Lan DELETE itinerary → 0 rows (owner-only policy)',
    !e10 && Array.isArray(deleted) && deleted.length === 0,
    `deleted=${deleted?.length} err=${e10?.message}`)

  // 11. Lan accepts the invite
  const { data: accepted, error: e11 } = await lan.sb
    .from('itinerary_collaborators')
    .update({ status: 'accepted', responded_at: new Date().toISOString() })
    .eq('id', collab.id)
    .select()
    .single()
  assert('11. Lan accepts invite (self_respond RLS)', !e11 && accepted?.status === 'accepted', e11?.message)

  // 11b. After accept, Lan can PATCH stop
  const { data: patchedAfter, error: e11b } = await lan.sb
    .from('itinerary_stops')
    .update({ notes: 'Updated by Lan after accepting' })
    .eq('id', stopA.id)
    .select()
  assert('11b. Lan PATCHes stop after accepting (collab_write granted)',
    !e11b && Array.isArray(patchedAfter) && patchedAfter.length === 1 && patchedAfter[0].notes?.includes('Lan'),
    `patched=${patchedAfter?.length} err=${e11b?.message}`)

  // 12. John creates share token
  const { data: share, error: e12 } = await john.sb
    .from('itinerary_share')
    .upsert({ itinerary_id: itin.id, enabled: true }, { onConflict: 'itinerary_id' })
    .select()
    .single()
  assert('12. John creates share link', !e12 && share?.token, e12?.message)

  // 13. Anonymous (no auth) can read the share row only when enabled
  const anonSb = createClient(URL, KEY, { auth: { persistSession: false } })
  const { data: shareAsAnon, error: e13 } = await anonSb
    .from('itinerary_share')
    .select('*')
    .eq('token', share?.token)
    .maybeSingle()
  assert('13. Anonymous reads share row by token', !e13 && !!shareAsAnon, e13?.message)

  // 14. Cleanup — delete cascades
  const { error: e14 } = await john.sb.from('itineraries').delete().eq('id', itin.id)
  assert('14. John deletes itinerary (cascade)', !e14, e14?.message)
  const { data: stopsAfter, error: e14b } = await john.sb
    .from('itinerary_stops')
    .select('id')
    .eq('itinerary_id', itin.id)
  assert('14b. Stops were cascaded', !e14b && (!stopsAfter || stopsAfter.length === 0), e14b?.message)

  console.log(`\n--- ${fails === 0 ? 'ALL PASS' : `${fails} FAIL`} ---`)
  process.exit(fails === 0 ? 0 : 1)
})().catch((e) => { console.error('FATAL', e.message); process.exit(1) })