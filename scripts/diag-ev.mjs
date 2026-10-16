import { Client } from 'pg'
const c = new Client({ connectionString: 'postgresql://postgres:that1arlecchino@db.pqvnjgyqbxlylawwogjv.supabase.co:5432/postgres', ssl: { rejectUnauthorized: false } })
await c.connect()
const { rows } = await c.query(`
  SELECT id, email, attempts, verified_at, consumed_at, expires_at, created_at
  FROM public.email_verifications
  ORDER BY created_at DESC
  LIMIT 5
`)
console.log('Recent email_verifications:')
for (const r of rows) {
  const v = r.verified_at ? 'V' : '·'
  const u = r.consumed_at ? 'C' : '·'
  console.log(`  ${r.email.padEnd(40)} ${v}${u} attempts=${r.attempts}  ${r.created_at.toISOString()}`)
}
await c.end()
