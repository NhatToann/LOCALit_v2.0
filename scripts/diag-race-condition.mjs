// scripts/diag-race-condition.mjs
// Simulate: 2 clicks in quick succession both call openConversationWithBuddy
// Click 1: existing check (null) → insert (OK, returns id X)
// Click 2: existing check (might be null due to read replica lag) → insert → 409 (UNIQUE conflict)
import { createClient } from '@supabase/supabase-js'

const URL = 'https://pqvnjgyqbxlylawwogjv.supabase.co'
const ANON = 'sb_publishable_3uRUZqdvazd4cENt8WOWJA_SB7HmCEE'
const LAN = '11111111-1111-1111-1111-111111111111'
const TOAN = 'f2df98b0-96cf-451d-9d85-5060ddc1ca01'

// Pre-clean
import { Client } from 'pg'
const pg = new Client({
  connectionString: `postgresql://postgres:${process.env.SUPABASE_DB_PASSWORD}@db.pqvnjgyqbxlylawwogjv.supabase.co:5432/postgres`,
  ssl: { rejectUnauthorized: false },
})
await pg.connect()
await pg.query('DELETE FROM public.conversations')
await pg.end()

const sb = createClient(URL, ANON, { auth: { persistSession: false } })
await sb.auth.signInWithPassword({ email: 'lan.pham@localit.dev', password: 'password123' })

console.log('=== Test 1: 2 clicks with existing check between ===')
const { data: existing1 } = await sb.from('conversations')
  .select('id')
  .or(`and(tourist_id.eq.${LAN},buddy_id.eq.${TOAN}),and(tourist_id.eq.${TOAN},buddy_id.eq.${LAN})`)
  .maybeSingle()
console.log('Click 1 existing check:', { found: existing1?.id })

// Click 1 inserts
const click1 = sb.from('conversations')
  .insert({ tourist_id: TOAN, buddy_id: LAN })
  .select('id').single()
  .then(r => r)
const { data: c1, error: e1 } = await click1
console.log('Click 1 insert:', { id: c1?.id, err: e1?.message })

// Click 2 happens BEFORE click 1 completes (simulated by parallel invocation)
// Realistic: existing check still null because we don't await click1
const { data: existing2 } = await sb.from('conversations')
  .select('id')
  .or(`and(tourist_id.eq.${LAN},buddy_id.eq.${TOAN}),and(tourist_id.eq.${TOAN},buddy_id.eq.${LAN})`)
  .maybeSingle()
console.log('Click 2 existing check (parallel):', { found: existing2?.id })

// Click 2 inserts
const { data: c2, error: e2 } = await sb.from('conversations')
  .insert({ tourist_id: TOAN, buddy_id: LAN })
  .select('id').single()
console.log('Click 2 insert:', { id: c2?.id, err: e2?.message, code: e2?.code })

// Check
console.log('\nFinal DB state:')
const pg2 = new Client({
  connectionString: `postgresql://postgres:${process.env.SUPABASE_DB_PASSWORD}@db.pqvnjgyqbxlylawwogjv.supabase.co:5432/postgres`,
  ssl: { rejectUnauthorized: false },
})
await pg2.connect()
const { rows } = await pg2.query('SELECT id, tourist_id, buddy_id, created_at FROM public.conversations')
console.log('Rows:', rows)

// Try with .upsert() — this is the proper fix
console.log('\n=== Test 2: .upsert() with onConflict ===')
// Cleanup
await pg2.query('DELETE FROM public.conversations')
await pg2.end()
await sb.auth.signOut()

// Insert one conv
const sb2 = createClient(URL, ANON, { auth: { persistSession: false } })
await sb2.auth.signInWithPassword({ email: 'lan.pham@localit.dev', password: 'password123' })
const { data: u1, error: ue1 } = await sb2.from('conversations')
  .upsert({ tourist_id: TOAN, buddy_id: LAN }, { onConflict: 'tourist_id,buddy_id', ignoreDuplicates: true })
  .select('id')
console.log('Upsert 1:', { id: u1?.[0]?.id, err: ue1?.message })

const { data: u2, error: ue2 } = await sb2.from('conversations')
  .upsert({ tourist_id: TOAN, buddy_id: LAN }, { onConflict: 'tourist_id,buddy_id', ignoreDuplicates: true })
  .select('id')
console.log('Upsert 2:', { id: u2?.[0]?.id, err: ue2?.message })

const pg3 = new Client({
  connectionString: `postgresql://postgres:${process.env.SUPABASE_DB_PASSWORD}@db.pqvnjgyqbxlylawwogjv.supabase.co:5432/postgres`,
  ssl: { rejectUnauthorized: false },
})
await pg3.connect()
const { rows: final } = await pg3.query('SELECT id, tourist_id, buddy_id FROM public.conversations')
console.log('Final rows after upsert:', final)
await pg3.query('DELETE FROM public.conversations')
await pg3.end()
await sb2.auth.signOut()

console.log('\n=== Done ===')
