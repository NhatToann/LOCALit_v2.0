import { Client } from "pg"
const c = new Client({ host: "db.pqvnjgyqbxlylawwogjv.supabase.co", port: 5432, user: "postgres", password: "that1arlecchino", database: "postgres", ssl: { rejectUnauthorized: false } })
await c.connect()
const { rows } = await c.query(`
  SELECT n.id, n.user_id AS recipient_id, p.full_name AS recipient,
         n.type, n.title, n.link, n.actor_name,
         pt.role AS actor_role
  FROM public.notifications n
  LEFT JOIN public.profiles p ON p.id = n.user_id
  LEFT JOIN public.profiles pt ON pt.id = n.actor_id
  WHERE n.type = 'connection_request'
  ORDER BY n.created_at DESC`)
console.log("=== connection_request notifications ===")
console.table(rows)
await c.end()
