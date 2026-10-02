// scripts/diag-chat-fk.mjs — diagnose the FK violation on conversations insert
import { Client } from 'pg'

const DB_URL = process.env.DATABASE_URL ||
  `postgresql://postgres:${process.env.SUPABASE_DB_PASSWORD}@db.pqvnjgyqbxlylawwogjv.supabase.co:5432/postgres`

if (!process.env.DATABASE_URL && !process.env.SUPABASE_DB_PASSWORD) {
  console.error('Set SUPABASE_DB_PASSWORD env var first.')
  process.exit(1)
}

const client = new Client({
  connectionString: DB_URL,
  ssl: { rejectUnauthorized: false },
})
await client.connect()

console.log('=== FK constraints on conversations ===')
const { rows: fks } = await client.query(`
  SELECT conname, pg_get_constraintdef(c.oid) AS def
  FROM pg_constraint c
  JOIN pg_namespace n ON n.oid = c.connamespace
  WHERE n.nspname = 'public'
    AND conrelid = 'public.conversations'::regclass
    AND contype = 'f'
  ORDER BY conname
`)
for (const r of fks) console.log('  ', r.conname, '→', r.def)

console.log('\n=== Auth users (id, email) ===')
const { rows: users } = await client.query(`
  SELECT id, email, raw_user_meta_data->>'full_name' AS full_name
  FROM auth.users
  ORDER BY email
`)
for (const r of users) console.log('  ', r.id, '|', r.email, '|', r.full_name)

console.log('\n=== Profiles (id, role) ===')
const { rows: profiles } = await client.query(`
  SELECT id, role, full_name FROM public.profiles ORDER BY role, full_name
`)
for (const r of profiles) console.log('  ', r.id, '|', r.role, '|', r.full_name)

console.log('\n=== Tourists (id) — should match profiles where role=tourist ===')
const { rows: tourists } = await client.query(`
  SELECT id FROM public.tourists ORDER BY id
`)
for (const r of tourists) console.log('  ', r.id)

console.log('\n=== Buddies (id) — should match profiles where role=buddy ===')
const { rows: buddies } = await client.query(`
  SELECT id FROM public.buddies ORDER BY id
`)
for (const r of buddies) console.log('  ', r.id)

console.log('\n=== Mismatches: profiles where role=tourist but no row in tourists ===')
const { rows: mism1 } = await client.query(`
  SELECT p.id, p.role, p.full_name FROM public.profiles p
  LEFT JOIN public.tourists t ON t.id = p.id
  WHERE p.role = 'tourist' AND t.id IS NULL
`)
console.log('  count:', mism1.length)
for (const r of mism1) console.log('    ', r)

console.log('\n=== Mismatches: profiles where role=buddy but no row in buddies ===')
const { rows: mism2 } = await client.query(`
  SELECT p.id, p.role, p.full_name FROM public.profiles p
  LEFT JOIN public.buddies b ON b.id = p.id
  WHERE p.role = 'buddy' AND b.id IS NULL
`)
console.log('  count:', mism2.length)
for (const r of mism2) console.log('    ', r)

console.log('\n=== Existing conversations ===')
const { rows: convs } = await client.query(`
  SELECT c.id, c.tourist_id, c.buddy_id, t.profile_id, b.profile_id
  FROM public.conversations c
  LEFT JOIN public.tourists t ON t.id = c.tourist_id
  LEFT JOIN public.buddies b ON b.id = c.buddy_id
`)
console.log('  count:', convs.length)
for (const r of convs) console.log('    ', r)

await client.end()