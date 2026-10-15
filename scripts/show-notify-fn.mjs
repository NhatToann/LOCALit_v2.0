import { Client } from "pg"
const c = new Client({ host: "db.pqvnjgyqbxlylawwogjv.supabase.co", port: 5432, user: "postgres", password: "that1arlecchino", database: "postgres", ssl: { rejectUnauthorized: false } })
await c.connect()
const { rows } = await c.query(`SELECT pg_get_functiondef(p.oid) AS def FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='notify_on_connection'`)
console.log(rows[0].def)
await c.end()
