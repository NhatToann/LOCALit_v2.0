import { Client } from "pg"
const c = new Client({ host: "db.pqvnjgyqbxlylawwogjv.supabase.co", port: 5432, user: "postgres", password: "that1arlecchino", database: "postgres", ssl: { rejectUnauthorized: false } })
await c.connect()
const { rows } = await c.query(`
  SELECT p.id, p.full_name, p.role, u.email,
         (u.encrypted_password IS NOT NULL AND u.encrypted_password <> '') AS has_pw,
         u.email_confirmed_at IS NOT NULL AS confirmed
  FROM public.profiles p LEFT JOIN auth.users u ON u.id = p.id
  ORDER BY p.role, p.full_name`)
console.table(rows)
await c.end()
