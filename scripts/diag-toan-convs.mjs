import { Client } from 'pg'
const c = new Client({
  connectionString: `postgresql://postgres:${process.env.SUPABASE_DB_PASSWORD}@db.pqvnjgyqbxlylawwogjv.supabase.co:5432/postgres`,
  ssl: { rejectUnauthorized: false },
})
await c.connect()

const TOAN = 'f2df98b0-96cf-451d-9d85-5060ddc1ca01'
const LAN = '11111111-1111-1111-1111-111111111111'

console.log('=== ALL conversations involving Toan (current DB state) ===')
const { rows: toan } = await c.query(
  `SELECT id, tourist_id, buddy_id, created_at FROM public.conversations
   WHERE tourist_id = $1 OR buddy_id = $1 ORDER BY created_at DESC`,
  [TOAN]
)
console.log('Total:', toan.length)
toan.forEach(r => console.log('  -', r))

console.log('\n=== ALL conversations involving Lan (current DB state) ===')
const { rows: lan } = await c.query(
  `SELECT id, tourist_id, buddy_id, created_at FROM public.conversations
   WHERE tourist_id = $1 OR buddy_id = $1 ORDER BY created_at DESC`,
  [LAN]
)
console.log('Total:', lan.length)
lan.forEach(r => console.log('  -', r))

await c.end()
