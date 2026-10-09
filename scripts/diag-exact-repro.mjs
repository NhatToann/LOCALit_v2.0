// scripts/diag-exact-repro.mjs
// EXACT reproduction of the bug user reported:
// User said: openConversationWithBuddy gets 409 Conflict on POST conversations
// Browser log: POST .../conversations?select=id 409 (Conflict)
// Hypothesis: existing check fails to find row, then insert fails with FK 23503
//             (which PostgREST surfaces as 409 Conflict for INSERT)
import { createClient } from '@supabase/supabase-js'

const URL = 'https://pqvnjgyqbxlylawwogjv.supabase.co'
const ANON = 'sb_publishable_3uRUZqdvazd4cENt8WOWJA_SB7HmCEE'
const LAN = '11111111-1111-1111-1111-111111111111'
const TOAN = 'f2df98b0-96cf-451d-9d85-5060ddc1ca01'

console.log('=== EXACT REPRO ===')

// Step 1: Toan (tourist) opens chat with Lan — this is the FIRST time,
// so the insert should succeed and create the conversation in
// (tourist=TOAN, buddy=LAN) orientation.
console.log('\n[1] Toan signs in and opens chat with Lan:')
const toanSb = createClient(URL, ANON, { auth: { persistSession: false } })
await toanSb.auth.signInWithPassword({ email: 'nhattoan2003+toan@gmail.com', password: 'password123' })
const { data: created, error: createErr } = await toanSb.from('conversations')
  .insert({ tourist_id: TOAN, buddy_id: LAN })
  .select('id')
  .single()
console.log('  ->', { id: created?.id, err: createErr?.message })
await toanSb.auth.signOut()

// Step 2: Lan (buddy) opens chat with Toan — same URL /chat?buddy=TOAN
// The existing check should find the row, but we need to test the
// real Supabase client behavior including RLS.
console.log('\n[2] Lan signs in, navigates to /chat?buddy=TOAN:')
const lanSb = createClient(URL, ANON, { auth: { persistSession: false } })
await lanSb.auth.signInWithPassword({ email: 'lan.pham@localit.dev', password: 'password123' })

// This is the EXACT query from app/chat/page.tsx line 500-509
const { data: existing, error: checkErr } = await lanSb.from('conversations')
  .select('id')
  .or(
    `and(tourist_id.eq.${LAN},buddy_id.eq.${TOAN}),and(tourist_id.eq.${TOAN},buddy_id.eq.${LAN})`,
  )
  .maybeSingle()
console.log('  existing check:', { found: existing?.id, err: checkErr?.message })

// Step 3: Simulate the bug — pretend existing check returned null,
// then try the role-resolved insert (my fix's code path).
// My fix's payload when Lan (buddy) opens chat with Toan (tourist):
//   myRoleResolved === 'buddy' → { tourist_id: TOAN, buddy_id: LAN }
const { data: ins1, error: insErr1 } = await lanSb.from('conversations')
  .insert({ tourist_id: TOAN, buddy_id: LAN })
  .select('id')
  .single()
console.log('  insert (TOAN=tourist, LAN=buddy) [my fix orientation]:', {
  id: ins1?.id, err: insErr1?.message
})

// Step 4: Now try the WRONG orientation (this is the pre-fix bug):
//   pre-fix: { tourist_id: partnerId, buddy_id: myId } when myRole='buddy'
//   so { tourist_id: TOAN, buddy_id: LAN } — same as my fix
// Actually my fix matches the existing orientation, so should be fine.
await lanSb.auth.signOut()

// Cleanup
const { Client } = await import('pg')
const pg = new Client({
  connectionString: `postgresql://postgres:${process.env.SUPABASE_DB_PASSWORD}@db.pqvnjgyqbxlylawwogjv.supabase.co:5432/postgres`,
  ssl: { rejectUnauthorized: false },
})
await pg.connect()
const { rowCount } = await pg.query(`DELETE FROM public.conversations WHERE (tourist_id = $1 AND buddy_id = $2) OR (tourist_id = $2 AND buddy_id = $1)`, [LAN, TOAN])
console.log('\n[cleanup] Deleted', rowCount, 'rows')
await pg.end()

console.log('\n=== End ===')
