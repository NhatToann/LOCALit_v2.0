// Show all connections for the two test users
import { Client } from 'pg'

const c = new Client({
  connectionString: 'postgresql://postgres:that1arlecchino@db.pqvnjgyqbxlylawwogjv.supabase.co:5432/postgres',
  ssl: { rejectUnauthorized: false },
})
await c.connect()
const r = await c.query(`
  SELECT c.id, c.status, c.duration_days, c.accepted_at, c.expires_at, c.locked_at, c.renewed_at, c.created_at, c.updated_at,
         pr.full_name AS requester, re.full_name AS recipient
  FROM public.connections c
  JOIN public.profiles pr ON pr.id = c.requester_id
  JOIN public.profiles re ON re.id = c.recipient_id
  WHERE c.requester_id IN ('11111111-1111-1111-1111-111111111111', 'aaaa1111-1111-1111-1111-111111111111')
     OR c.recipient_id IN ('11111111-1111-1111-1111-111111111111', 'aaaa1111-1111-1111-1111-111111111111')
  ORDER BY c.updated_at DESC
`)
console.log(JSON.stringify(r.rows, null, 2))
await c.end()
