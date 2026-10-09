// scripts/verify-fk-fix.mjs — comprehensive verification of the FK fix
// Tests ALL 4 scenarios with real DB queries, matching the exact code path
// in app/chat/page.tsx → openConversationWithBuddy()
import { Client } from 'pg'
const DB = `postgresql://postgres:${process.env.SUPABASE_DB_PASSWORD}@db.pqvnjgyqbxlylawwogjv.supabase.co:5432/postgres`
const client = new Client({ connectionString: DB, ssl: { rejectUnauthorized: false } })
await client.connect()

const LAN = '11111111-1111-1111-1111-111111111111'        // role=buddy
const JOHN = 'aaaa1111-1111-1111-1111-111111111111'       // role=buddy (data!)
const TOAN = 'f2df98b0-96cf-451d-9d85-5060ddc1ca01'       // role=tourist
const MIKE = 'aaaa3333-3333-3333-3333-333333333333'       // role=tourist

async function cleanup(a, b) {
  await client.query(
    `DELETE FROM public.conversations WHERE (tourist_id = $1 AND buddy_id = $2) OR (tourist_id = $2 AND buddy_id = $1)`,
    [a, b]
  )
}

// Simulate the FIXED code path from app/chat/page.tsx
async function fixedInsert(myId, partnerId) {
  // 1. Resolve both roles from profiles
  const { rows: meRows } = await client.query('SELECT role FROM public.profiles WHERE id = $1', [myId])
  const { rows: themRows } = await client.query('SELECT role FROM public.profiles WHERE id = $1', [partnerId])
  const myRole = meRows[0]?.role
  const partnerRole = themRows[0]?.role

  if (!myRole || !partnerRole) return { ok: false, error: 'unable to resolve roles' }
  if (myRole === partnerRole) {
    // Match app's pluralization: 'buddy' → 'buddies', 'tourist' → 'tourists'
    const rolePlural = myRole === 'buddy' ? 'buddies' : myRole + 's'
    return { ok: false, error: `both users are ${rolePlural}` }
  }

  const insertPayload = myRole === 'buddy'
    ? { tourist_id: partnerId, buddy_id: myId }
    : { tourist_id: myId, buddy_id: partnerId }

  try {
    const { rows } = await client.query(
      `INSERT INTO public.conversations (tourist_id, buddy_id) VALUES ($1, $2) RETURNING id`,
      [insertPayload.tourist_id, insertPayload.buddy_id]
    )
    return { ok: true, id: rows[0].id, payload: insertPayload }
  } catch (e) {
    return { ok: false, error: `FK violation: ${e.message.split('\n')[0]}` }
  }
}

let pass = 0, fail = 0
function check(name, cond, detail) {
  if (cond) { console.log('  PASS:', name, detail ?? ''); pass++ }
  else { console.log('  FAIL:', name, detail ?? ''); fail++ }
}

// ========== SCENARIO 1: Buddy ↔ Tourist (happy path) ==========
console.log('\n[1] Buddy (Lan) opens chat with Tourist (Toan):')
await cleanup(LAN, TOAN)
let r = await fixedInsert(LAN, TOAN)
check('insert succeeded', r.ok, JSON.stringify(r))
check('payload is correct (TOAN=tourist, LAN=buddy)', r.ok && r.payload.tourist_id === TOAN && r.payload.buddy_id === LAN)
await cleanup(LAN, TOAN)

// ========== SCENARIO 2: Tourist ↔ Buddy (happy path reversed) ==========
console.log('\n[2] Tourist (Mike) opens chat with Buddy (Lan):')
await cleanup(MIKE, LAN)
r = await fixedInsert(MIKE, LAN)
check('insert succeeded', r.ok, JSON.stringify(r))
check('payload is correct (MIKE=tourist, LAN=buddy)', r.ok && r.payload.tourist_id === MIKE && r.payload.buddy_id === LAN)
await cleanup(MIKE, LAN)

// ========== SCENARIO 3: Buddy ↔ Buddy (original repro - same role) ==========
console.log('\n[3] Buddy (Lan) opens chat with Buddy (John) — ORIGINAL REPRO:')
await cleanup(LAN, JOHN)
r = await fixedInsert(LAN, JOHN)
check('insert blocked with same-role error', !r.ok && r.error?.includes('both users are buddies'), JSON.stringify(r))
check('no FK violation thrown', !r.error?.includes('FK violation'))
await cleanup(LAN, JOHN)

// ========== SCENARIO 4: Tourist ↔ Tourist (same role, other side) ==========
console.log('\n[4] Tourist (Toan) opens chat with Tourist (Mike) — same-role other side:')
await cleanup(TOAN, MIKE)
r = await fixedInsert(TOAN, MIKE)
check('insert blocked with same-role error', !r.ok && r.error?.includes('both users are tourists'), JSON.stringify(r))
await cleanup(TOAN, MIKE)

// ========== SCENARIO 5: Original pre-fix code with same-role input ==========
console.log('\n[5] Pre-fix code (no role check) on same-role input:')
async function preFixInsert(myId, partnerId, myRole) {
  // Pre-fix: assumed partner's role was inverse of myRole
  const insertPayload = myRole === 'buddy'
    ? { tourist_id: partnerId, buddy_id: myId }
    : { tourist_id: myId, buddy_id: partnerId }
  try {
    await client.query(
      `INSERT INTO public.conversations (tourist_id, buddy_id) VALUES ($1, $2)`,
      [insertPayload.tourist_id, insertPayload.buddy_id]
    )
    return { ok: true }
  } catch (e) {
    return { ok: false, error: `FK violation: ${e.message.split('\n')[0]}` }
  }
}
r = await preFixInsert(LAN, JOHN, 'buddy')
check('pre-fix WOULD have failed with FK violation', !r.ok && r.error?.includes('FK violation'), JSON.stringify(r))

console.log(`\n=== Result: ${pass} PASS, ${fail} FAIL ===`)
await client.end()
process.exit(fail > 0 ? 1 : 0)
