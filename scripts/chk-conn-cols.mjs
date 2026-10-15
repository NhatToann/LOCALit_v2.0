import { Client } from "pg"
const c = new Client({ host: "db.pqvnjgyqbxlylawwogjv.supabase.co", port: 5432, user: "postgres", password: "that1arlecchino", database: "postgres", ssl: { rejectUnauthorized: false } })
await c.connect()
const { rows } = await c.query(`
  SELECT column_name, data_type, is_nullable, column_default
  FROM information_schema.columns
  WHERE table_schema='public' AND table_name='connections' ORDER BY ordinal_position`)
console.log("=== connections columns ===")
console.table(rows)
const d = await c.query(`SELECT * FROM public.connections WHERE tourist_id=$1 AND buddy_id=$2`, ["f2df98b0-96cf-451d-9d85-5060ddc1ca01","11111111-1111-1111-1111-111111111111"])
console.log("=== the test connection row ===")
console.table(d.rows)
await c.end()
