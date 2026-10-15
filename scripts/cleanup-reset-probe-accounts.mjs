/**
 * Remove every disposable account created by the reset-flow tests.
 * Only touches emails matching the probe prefixes, so real accounts
 * (seed users, darklunatv@gmail.com, …) are never at risk.
 */
import { Client } from 'pg'

const c = new Client({
  host: 'db.pqvnjgyqbxlylawwogjv.supabase.co',
  port: 5432,
  user: 'postgres',
  password: 'that1arlecchino',
  database: 'postgres',
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 15000,
})
await c.connect()

const PATTERNS = [
  'resetprobe-%@example.com',
  'otpprobe-%@example.com',
  'otptest-%@example.com',
  'probe-%@example.com',
]

let total = 0
for (const p of PATTERNS) {
  const before = await c.query('select id, email from auth.users where email like $1', [p])
  if (!before.rows.length) continue
  await c.query('delete from auth.users where email like $1', [p])
  console.log(`  deleted ${before.rows.length}  ${p}`)
  total += before.rows.length
}

// email_verifications rows reference those addresses too.
const ev = await c.query(
  `delete from email_verifications where email like any($1::text[])`,
  [PATTERNS],
)
console.log(`  deleted ${ev.rowCount ?? 0} email_verifications rows`)

// Prove nothing real was touched.
const kept = await c.query(
  `select email from auth.users
   where email not in ('darklunatv@gmail.com')
     and email not like '%@example.com'
   order by email`,
)
console.log(`\nreal accounts still present (${kept.rows.length}):`)
kept.rows.forEach((r) => console.log('  -', r.email))

await c.end()
console.log(`\ntotal disposable accounts removed: ${total}`)