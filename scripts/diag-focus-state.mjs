import { Client } from 'pg'
const c = new Client({
  connectionString: 'postgresql://postgres:that1arlecchino@db.pqvnjgyqbxlylawwogjv.supabase.co:5432/postgres',
  ssl: { rejectUnauthorized: false },
})
await c.connect()
console.log('--- focus_requests ---')
const r1 = await c.query(`SELECT id, requester_id, recipient_id, status, expires_at FROM public.focus_requests ORDER BY created_at DESC LIMIT 10`)
console.log(JSON.stringify(r1.rows, null, 2))
console.log('--- focus_sessions ---')
const r2 = await c.query(`SELECT id, user_a_id, user_b_id, started_at, ended_at FROM public.focus_sessions ORDER BY started_at DESC LIMIT 10`)
console.log(JSON.stringify(r2.rows, null, 2))
await c.end()
