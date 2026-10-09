// scripts/force-cleanup-convs.mjs
import { createClient } from '@supabase/supabase-js'
const URL = 'https://pqvnjgyqbxlylawwogjv.supabase.co'
const ANON = 'sb_publishable_3uRUZqdvazd4cENt8WOWJA_SB7HmCEE'
const LAN = '11111111-1111-1111-1111-111111111111'
const TOAN = 'f2df98b0-96cf-451d-9d85-5060ddc1ca01'

const sb = createClient(URL, ANON, { auth: { persistSession: false } })
await sb.auth.signInWithPassword({ email: 'lan.pham@localit.dev', password: 'password123' })

// Check what's there
const { data: all } = await sb.from('conversations').select('id, tourist_id, buddy_id')
console.log('Before cleanup:', all)

// Try delete via the .or() pattern
const { data: del1, error: e1 } = await sb.from('conversations')
  .delete()
  .or(`and(tourist_id.eq.${LAN},buddy_id.eq.${TOAN}),and(tourist_id.eq.${TOAN},buddy_id.eq.${LAN})`)
  .select()
console.log('After .or() delete:', { data: del1, err: e1?.message })

// Check again
const { data: all2 } = await sb.from('conversations').select('id, tourist_id, buddy_id')
console.log('After cleanup:', all2)

await sb.auth.signOut()
