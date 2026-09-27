import { Client } from 'pg'

const pw = process.env.SUPABASE_DB_PASSWORD || 'that1arlecchino'
const c = new Client({
  connectionString: `postgresql://postgres:${pw}@db.pqvnjgyqbxlylawwogjv.supabase.co:5432/postgres`,
  ssl: { rejectUnauthorized: false },
})
await c.connect()

// Just confirm current state — we won't actually delete users since they may
// be tied to existing data. Instead we'll print which IDs are still unverified.
const { rows } = await c.query(
  "SELECT id, email, email_confirmed_at FROM auth.users WHERE email_confirmed_at IS NULL ORDER BY created_at DESC LIMIT 5",
)
console.log('Unverified users available for OTP testing:')
console.log(JSON.stringify(rows, null, 2))

await c.end()
