// scripts/diag-orphan-insert.mjs
// Test: Lan (buddy) opens chat with orphan tourist (apitest.1791392145763)
// Existing check: 0 rows
// Same-role check: myRole='buddy' vs partnerRole='tourist' → different, passes
// Insert: { tourist_id: orphanId, buddy_id: LAN } → FK 23503 because orphan
//          has no row in tourists table
import { createClient } from '@supabase/supabase-js'

const URL = 'https://pqvnjgyqbxlylawwogjv.supabase.co'
const ANON = 'sb_publishable_3uRUZqdvazd4cENt8WOWJA_SB7HmCEE'
const LAN = '11111111-1111-1111-1111-111111111111'
const ORPHAN = 'apitest.1791392145763'  // doesn't exist

// First get the actual orphan IDs from DB
import { Client } from 'pg'
const pg = new Client({
  connectionString: `postgresql://postgres:${process.env.SUPABASE_DB_PASSWORD}@db.pqvnjgyqbxlylawwogjv.supabase.co:5432/postgres`,
  ssl: { rejectUnauthorized: false },
})
await pg.connect()
const { rows: orphans } = await pg.query(`
  SELECT p.id, p.role FROM public.profiles p
  WHERE (p.role = 'tourist' AND NOT EXISTS(SELECT 1 FROM public.tourists t WHERE t.id = p.id))
     OR (p.role = 'buddy' AND NOT EXISTS(SELECT 1 FROM public.buddies b WHERE b.id = p.id))
`)
console.log('Orphan profiles:', orphans)
const ORPHAN_ID = orphans[0]?.id
await pg.end()

if (!ORPHAN_ID) {
  console.log('No orphans — exiting')
  process.exit(0)
}

const sb = createClient(URL, ANON, { auth: { persistSession: false } })
await sb.auth.signInWithPassword({ email: 'lan.pham@localit.dev', password: 'password123' })

console.log(`\n[1] Resolve partner role for orphan ${ORPHAN_ID}:`)
const { data: p, error: pErr } = await sb.from('profiles').select('role').eq('id', ORPHAN_ID).maybeSingle()
console.log('  ->', { role: p?.role, err: pErr?.message })

console.log('\n[2] Existing check:')
const { data: existing, error: eErr } = await sb.from('conversations')
  .select('id')
  .or(`and(tourist_id.eq.${LAN},buddy_id.eq.${ORPHAN_ID}),and(tourist_id.eq.${ORPHAN_ID},buddy_id.eq.${LAN})`)
  .maybeSingle()
console.log('  ->', { found: existing?.id, err: eErr?.message })

console.log('\n[3] Insert { tourist_id: ORPHAN, buddy_id: LAN } (my fix orientation):')
const { data: ins, error: insErr } = await sb.from('conversations')
  .insert({ tourist_id: ORPHAN_ID, buddy_id: LAN })
  .select('id')
  .single()
console.log('  ->', { id: ins?.id, err: insErr?.message, code: insErr?.code })

await sb.auth.signOut()
console.log('\nDone')
