import { Client } from 'pg'
const HOST = 'db.pqvnjgyqbxlylawwogjv.supabase.co'
const PORT = 5432
const DB_USER = 'postgres'
const DB_NAME = 'postgres'
const DB_PW = process.env.DB_PW || 'that1arlecchino'
;(async () => {
  const pg = new Client({ host: HOST, port: PORT, user: DB_USER, password: DB_PW, database: DB_NAME, ssl: { rejectUnauthorized: false } })
  await pg.connect()

  // Drop trigger (keep function for re-enable later)
  await pg.query('DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users')
  console.log('Trigger dropped.')

  // Test signup
  const newEmail = 'no-trigger-' + Date.now() + '@localit-test.dev'
  const r1 = await fetch('https://pqvnjgyqbxlylawwogjv.supabase.co/auth/v1/signup', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': 'sb_publishable_3uRUZqdvazd4cENt8WOWJA_SB7HmCEE',
      'Authorization': 'Bearer sb_publishable_3uRUZqdvazd4cENt8WOWJA_SB7HmCEE',
    },
    body: JSON.stringify({
      email: newEmail, password: 'TestPass-1234',
      data: { full_name: 'No Trigger Test', role: 'tourist' },
    }),
  })
  console.log('signup status:', r1.status)
  const b = await r1.json()
  console.log('body:', JSON.stringify(b).substring(0, 500))

  const after = await pg.query("SELECT id, email FROM auth.users WHERE email = $1", [newEmail])
  console.log('row:', after.rows.length > 0 ? 'YES' : 'NO')

  await pg.end()
})()
