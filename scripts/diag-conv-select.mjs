// scripts/diag-conv-select.mjs
// Reproduce the conversations query that returns 400
// Pull a real uid from DB, construct the exact same query the app sends,
// and see what Supabase says.

import pg from 'pg'
const { Client } = pg
const c = new Client({
  connectionString: `postgresql://postgres:${process.env.DB_PW}@db.pqvnjgyqbxlylawwogjv.supabase.co:5432/postgres`,
  ssl: { rejectUnauthorized: false },
})
await c.connect()

// Get a real user id
const u = await c.query(`SELECT id FROM public.profiles LIMIT 1`)
const uid = u.rows[0].id
console.log('uid:', uid)

// Check what FK constraints exist
const fks = await c.query(`
  SELECT tc.constraint_name, tc.table_name, kcu.column_name,
         ccu.table_name AS foreign_table, ccu.column_name AS foreign_column
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
  JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name
  WHERE tc.constraint_type = 'FOREIGN KEY'
    AND tc.table_schema = 'public'
    AND tc.table_name = 'conversations'
`)
console.log('\nconversations FKs:')
for (const r of fks.rows) {
  console.log(' ', r.constraint_name, ':', r.table_name + '.' + r.column_name, '→', r.foreign_table + '.' + r.foreign_column)
}

// Try a simple Supabase REST call to conversations with select=id
const sbUrl = 'https://pqvnjgyqbxlylawwogjv.supabase.co'
const sbKey = 'sb_publishable_3uRUZqdvazd4cENt8WOWJA_SB7HmCEE'

// First: just select id, no embed
const r1 = await fetch(
  `${sbUrl}/rest/v1/conversations?select=id,buddy_id,tourist_id&buddy_id=eq.${uid}&limit=1`,
  { headers: { apikey: sbKey, authorization: `Bearer ${sbKey}` } },
)
console.log('\nSimple select (buddy_id=eq.uid):', r1.status)
const b1 = await r1.json()
console.log(JSON.stringify(b1).slice(0, 300))

// Then try the embed (old style)
const r2 = await fetch(
  `${sbUrl}/rest/v1/conversations?select=id,buddy_id,tourist_id,buddy:buddies(full_name)&buddy_id=eq.${uid}&limit=1`,
  { headers: { apikey: sbKey, authorization: `Bearer ${sbKey}` } },
)
console.log('\nOld embed (buddy:buddies):', r2.status)
const b2 = await r2.json()
console.log(JSON.stringify(b2).slice(0, 300))

// New embed (buddy_profile:safe_profiles!conversations_buddy_id_fkey)
const r3 = await fetch(
  `${sbUrl}/rest/v1/conversations?select=id,buddy_id,tourist_id,buddy_profile:safe_profiles!conversations_buddy_id_fkey(full_name,avatar_url,is_online,id,role)&buddy_id=eq.${uid}&limit=1`,
  { headers: { apikey: sbKey, authorization: `Bearer ${sbKey}` } },
)
console.log('\nNew embed (buddy_profile:safe_profiles!fk):', r3.status)
const b3 = await r3.json()
console.log(JSON.stringify(b3).slice(0, 300))

await c.end()
