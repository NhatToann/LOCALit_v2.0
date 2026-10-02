// scripts/diag-online-status.mjs — check is_online flags on profiles + buddies
import { Client } from 'pg'

const DB_URL = process.env.DATABASE_URL ||
  `postgresql://postgres:${process.env.SUPABASE_DB_PASSWORD}@db.pqvnjgyqbxlylawwogjv.supabase.co:5432/postgres`

const client = new Client({
  connectionString: DB_URL,
  ssl: { rejectUnauthorized: false },
})
await client.connect()

console.log('=== profiles.is_online (everyone) ===')
const { rows: p1 } = await client.query(`
  SELECT id, role, full_name, is_online, last_seen,
         (now() - last_seen) AS idle_for
  FROM public.profiles
  ORDER BY is_online DESC, last_seen DESC NULLS LAST
`)
for (const r of p1) console.log('  ', r)

console.log('\n=== buddies.is_online (column on buddies table) ===')
const { rows: p2 } = await client.query(`
  SELECT b.id, b.is_online, b.last_seen,
         p.full_name,
         (now() - b.last_seen) AS idle_for
  FROM public.buddies b
  JOIN public.profiles p ON p.id = b.id
  ORDER BY b.is_online DESC, b.last_seen DESC NULLS LAST
`)
for (const r of p2) console.log('  ', r)

console.log('\n=== Conversations (who has chat with whom) ===')
const { rows: convs } = await client.query(`
  SELECT c.id, c.tourist_id, c.buddy_id, c.last_message_preview
  FROM public.conversations
`)
for (const r of convs) console.log('  ', r)

console.log('\n=== safe_profiles definition ===')
const { rows: sv } = await client.query(`
  SELECT pg_get_viewdef('public.safe_profiles'::regclass, true) AS def
`)
console.log(sv[0]?.def)

await client.end()