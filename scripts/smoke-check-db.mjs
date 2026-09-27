import { Client } from 'pg'

const c = new Client({
  connectionString: 'postgresql://postgres:that1arlecchino@db.pqvnjgyqbxlylawwogjv.supabase.co:5432/postgres',
  ssl: { rejectUnauthorized: false },
})
await c.connect()

const r = await c.query(
  "SELECT id, email, email_confirmed_at, created_at FROM auth.users WHERE email LIKE 'flowtest%' ORDER BY created_at DESC LIMIT 3",
)
console.log('--- recent flowtest users ---')
console.log(JSON.stringify(r.rows, null, 2))

if (r.rows[0]) {
  const ev = await c.query(
    "SELECT id, user_id, attempts, consumed_at IS NOT NULL AS consumed, expires_at FROM email_verifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 3",
    [r.rows[0].id],
  )
  console.log('--- latest email_verifications ---')
  console.log(JSON.stringify(ev.rows, null, 2))
}

await c.end()
