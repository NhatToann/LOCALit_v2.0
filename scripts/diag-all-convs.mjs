import { Client } from 'pg'
const DB = `postgresql://postgres:${process.env.SUPABASE_DB_PASSWORD}@db.pqvnjgyqbxlylawwogjv.supabase.co:5432/postgres`
const client = new Client({ connectionString: DB, ssl: { rejectUnauthorized: false } })
await client.connect()

const LAN = '11111111-1111-1111-1111-111111111111'
console.log('=== ALL conversations involving Lan ===')
const { rows: lanConvs } = await client.query(
  `SELECT c.id, c.tourist_id, c.buddy_id, c.created_at,
          tp.full_name AS tourist_name, bp.full_name AS buddy_name
   FROM public.conversations c
   LEFT JOIN public.profiles tp ON tp.id = c.tourist_id
   LEFT JOIN public.profiles bp ON bp.id = c.buddy_id
   WHERE c.tourist_id = $1 OR c.buddy_id = $1
   ORDER BY c.created_at DESC`,
  [LAN]
)
console.log('Total:', lanConvs.length)
lanConvs.forEach(r => console.log('  -', r))

console.log('\n=== ALL recent conversations (last 24h) ===')
const { rows: recent } = await client.query(
  `SELECT c.id, c.tourist_id, c.buddy_id, c.created_at,
          tp.full_name AS tourist_name, bp.full_name AS buddy_name
   FROM public.conversations c
   LEFT JOIN public.profiles tp ON tp.id = c.tourist_id
   LEFT JOIN public.profiles bp ON bp.id = c.buddy_id
   WHERE c.created_at > NOW() - INTERVAL '24 hours'
   ORDER BY c.created_at DESC`
)
console.log('Recent:', recent.length)
recent.forEach(r => console.log('  -', r))

console.log('\n=== Check if conversations has any UNIQUE constraint ===')
const { rows: constraints } = await client.query(
  `SELECT conname, contype, pg_get_constraintdef(c.oid) AS def
   FROM pg_constraint c
   JOIN pg_class t ON t.oid = c.conrelid
   WHERE t.relname = 'conversations' AND contype IN ('u', 'x')`
)
console.log('Unique/Exclusion constraints:', constraints.length)
constraints.forEach(r => console.log('  -', r.conname, ':', r.def))

console.log('\n=== Check ALL indexes on conversations ===')
const { rows: idx } = await client.query(
  `SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'conversations'`
)
idx.forEach(r => console.log('  -', r.indexname, ':', r.indexdef))

await client.end()
