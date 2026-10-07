import { Client } from 'pg'
import bcrypt from 'bcryptjs'

const c = new Client({
  connectionString: 'postgresql://postgres:that1arlecchino@db.pqvnjgyqbxlylawwogjv.supabase.co:5432/postgres',
  ssl: { rejectUnauthorized: false },
})
await c.connect()

// 1. Check auth.users for the test user
const { rows: users } = await c.query(
  `SELECT id, email, email_confirmed_at, encrypted_password IS NOT NULL AS has_pw
   FROM auth.users WHERE email = 'e2e-final@autotest.dev'`,
)
console.log('auth.users:', JSON.stringify(users, null, 2))

// 2. Check identities for this user
const { rows: ids } = await c.query(
  `SELECT id, user_id, provider, provider_id FROM auth.identities
   WHERE user_id IN (SELECT id FROM auth.users WHERE email = 'e2e-final@autotest.dev')`,
)
console.log('auth.identities:', JSON.stringify(ids, null, 2))

// 3. Check profiles + tourists rows
const { rows: profs } = await c.query(
  `SELECT p.id, p.email, p.role, t.nationality, t.destination, t.interests, t.languages
   FROM public.profiles p LEFT JOIN public.tourists t ON p.id = t.id
   WHERE p.email = 'e2e-final@autotest.dev'`,
)
console.log('public.profiles+tourists:', JSON.stringify(profs, null, 2))

// 4. Verify the password bcrypt works (matches what GoTrue expects)
const { rows: pwRows } = await c.query(
  `SELECT encrypted_password FROM auth.users WHERE email = 'e2e-final@autotest.dev'`,
)
if (pwRows.length > 0) {
  const ok = await bcrypt.compare('Test1234!@#$', pwRows[0].encrypted_password)
  console.log('bcrypt match for "Test1234!@#$":', ok)
}

await c.end()