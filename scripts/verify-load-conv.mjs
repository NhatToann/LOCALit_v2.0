// scripts/verify-load-conv.mjs
// Test the new conversations query: tourist_profile + buddy_profile joins
// via FK on safe_profiles. Run against the live DB to make sure the
// embed works and doesn't 400.

const sb = process.env.SUPABASE_URL || 'https://pqvnjgyqbxlylawwogjv.supabase.co'
const key = process.env.SUPABASE_ANON_KEY || 'sb_publishable_3uRUZqdvazd4cENt8WOWJA_SB7HmCEE'

// Use service role to read all conversations
import { createClient } from '@supabase/supabase-js'
const srKey = process.env.SUPABASE_SERVICE_ROLE_KEY || (await fetch('http://localhost:1/no').catch(() => null))
// Get service role from env or directly query through pg
import pg from 'pg'
const { Client } = pg
const c = new Client({
  connectionString: `postgresql://postgres:${process.env.DB_PW}@db.pqvnjgyqbxlylawwogjv.supabase.co:5432/postgres`,
  ssl: { rejectUnauthorized: false },
})
await c.connect()

const r = await c.query(`
  SELECT
    c.id,
    c.tourist_id,
    c.buddy_id,
    tp.full_name AS tourist_name,
    bp.full_name AS buddy_name,
    tp.role AS tourist_role,
    bp.role AS buddy_role
  FROM public.conversations c
  LEFT JOIN public.profiles tp ON tp.id = c.tourist_id
  LEFT JOIN public.profiles bp ON bp.id = c.buddy_id
  ORDER BY c.created_at DESC
  LIMIT 20
`)
console.log('Conversation partners (last 20):')
for (const row of r.rows) {
  const sameRole = row.tourist_role === row.buddy_role
  console.log(
    `  ${row.id.slice(0, 8)}…  tourist=${row.tourist_name} (${row.tourist_role})  buddy=${row.buddy_name} (${row.buddy_role})  ${sameRole ? '[SAME ROLE]' : ''}`,
  )
}

console.log(`\nTotal conversations: ${r.rows.length}`)
await c.end()
