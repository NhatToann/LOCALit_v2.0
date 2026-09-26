import { Client } from 'pg'
const c = new Client({
  host: 'db.pqvnjgyqbxlylawwogjv.supabase.co',
  port: 5432,
  user: 'postgres',
  password: process.env.DB_PW || 'that1arlecchino',
  database: 'postgres',
  ssl: { rejectUnauthorized: false },
})
await c.connect()
const r = await c.query(`
  SELECT
    u.email,
    u.email_confirmed_at IS NOT NULL AS email_confirmed,
    p.role,
    p.full_name,
    p.phone,
    t.nationality,
    t.travel_style,
    t.interests,
    t.languages,
    t.budget_range,
    t.destination
  FROM auth.users u
  LEFT JOIN public.profiles p ON p.id = u.id
  LEFT JOIN public.tourists t ON t.id = u.id
  WHERE u.email = 'e2e_20260926115140@example.com'
`)
console.log(JSON.stringify(r.rows[0], null, 2))
await c.end()