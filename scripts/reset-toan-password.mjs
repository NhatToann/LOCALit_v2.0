// Reset Toàn's password to a known value via direct bcrypt update on
// auth.users.encrypted_password using pgcrypto's crypt() so the format
// matches what GoTrue expects on signin.
import { Client } from 'pg'
import crypto from 'node:crypto'

const EMAIL = 'darklunatv@gmail.com'
const NEW_PW = 'Test1234!'

const c = new Client({
  connectionString:
    'postgresql://postgres:that1arlecchino@db.pqvnjgyqbxlylawwogjv.supabase.co:5432/postgres',
  ssl: { rejectUnauthorized: false },
})
await c.connect()

// 1. Look up the user
const u = await c.query(`SELECT id FROM auth.users WHERE email = $1`, [EMAIL])
if (u.rows.length === 0) {
  console.error('No auth.users row for', EMAIL)
  process.exit(1)
}
const userId = u.rows[0].id
console.log('userId', userId)

// 2. Generate a bcrypt hash via pgcrypto (matches GoTrue's signin path)
const r = await c.query(
  `UPDATE auth.users
     SET encrypted_password = crypt($1, gen_salt('bf'))
   WHERE id = $2`,
  [NEW_PW, userId],
)
console.log('updated rows', r.rowCount)
await c.end()
console.log('Password set to', NEW_PW, 'for', EMAIL)
