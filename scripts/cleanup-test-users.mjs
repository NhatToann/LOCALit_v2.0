import { Client } from 'pg'
const c = new Client({
  host: 'db.pqvnjgyqbxlylawwogjv.supabase.co',
  port: 5432,
  user: 'postgres',
  password: process.env.DB_PW || 'that1arlecchino',
  database: 'postgres',
  ssl: { rejectUnauthorized: false },
})
const emails = process.argv.slice(2)
if (emails.length === 0) {
  console.error('Usage: node cleanup-test-users.mjs <email1> <email2> ...')
  process.exit(1)
}
await c.connect()
for (const email of emails) {
  const r = await c.query('DELETE FROM auth.users WHERE email = $1', [email])
  console.log(`deleted ${email}: ${r.rowCount} row(s)`)
}
await c.end()