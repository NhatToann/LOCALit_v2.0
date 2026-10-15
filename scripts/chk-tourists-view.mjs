import { Client } from "pg"
const c = new Client({ host: "db.pqvnjgyqbxlylawwogjv.supabase.co", port: 5432, user: "postgres", password: "that1arlecchino", database: "postgres", ssl: { rejectUnauthorized: false } })
await c.connect()
for (const v of ["safe_tourists", "safe_buddies_no_coords"]) {
  const { rows } = await c.query(`SELECT pg_get_viewdef($1::regclass, true) AS sql`, ["public." + v])
  console.log("=== " + v + " ===")
  console.log(rows[0].sql)
  console.log()
}
const { rows } = await c.query(`SELECT count(*) AS n FROM public.safe_tourists`)
console.log("safe_tourists rows:", rows[0].n)
const { rows: t2 } = await c.query(`SELECT count(*) AS n FROM public.tourists`)
console.log("tourists rows:", t2[0].n)
await c.end()
