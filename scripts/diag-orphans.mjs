import { Client } from 'pg'
const c = new Client({ connectionString: 'postgresql://postgres:that1arlecchino@db.pqvnjgyqbxlylawwogjv.supabase.co:5432/postgres', ssl: { rejectUnauthorized: false } })
await c.connect()

const { rows: users } = await c.query(`SELECT id, email FROM auth.users ORDER BY email`)
console.log('Current users:')
for (const u of users) console.log(`  ${u.email.padEnd(35)} ${u.id}`)

console.log('\nOrphan rows (FK refs to non-existent users):')
const checks = [
  ['itineraries', 'owner_id'],
  ['conversations', 'tourist_id'],
  ['conversations', 'buddy_id'],
  ['messages', 'sender_id'],
  ['notifications', 'user_id'],
  ['pending_calls', 'caller_id'],
  ['pending_calls', 'callee_id'],
  ['location_updates', 'user_id'],
  ['reviews', 'reviewer_id'],
  ['reviews', 'reviewee_id'],
  ['connections', 'requester_id'],
  ['connections', 'recipient_id'],
]
for (const [t, col] of checks) {
  const r = await c.query(`
    SELECT COUNT(*)::int AS n
    FROM public.${t} t
    WHERE t.${col} IS NOT NULL
      AND t.${col} NOT IN (SELECT id FROM auth.users)
  `)
  if (r.rows[0].n > 0) console.log(`  ${t}.${col}: ${r.rows[0].n} orphan(s)`)
}

const { rows: evCount } = await c.query(`SELECT COUNT(*)::int AS n FROM public.email_verifications`)
console.log(`\nemail_verifications: ${evCount[0].n} (all old test rows, not tied to any auth.users)`)

await c.end()
