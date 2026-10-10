import { Client } from 'pg'

const c = new Client({
  connectionString: 'postgresql://postgres:that1arlecchino@db.pqvnjgyqbxlylawwogjv.supabase.co:5432/postgres',
  ssl: { rejectUnauthorized: false },
})
await c.connect()

const q = async (label, sql) => {
  const r = await c.query(sql)
  console.log(`\n=== ${label} ===`)
  console.log(JSON.stringify(r.rows, null, 1))
}

await q('reviews RLS policies', `
  SELECT policyname, cmd, roles::text AS roles, qual
  FROM pg_policies WHERE schemaname='public' AND tablename='reviews'
`)

await q('reviews table grants', `
  SELECT grantee, privilege_type FROM information_schema.table_privileges
  WHERE table_schema='public' AND table_name='reviews' ORDER BY grantee, privilege_type
`)

await q('reviews RLS flag', `
  SELECT relrowsecurity, relforcerowsecurity FROM pg_class
  WHERE relname='reviews' AND relnamespace='public'::regnamespace
`)

await q('reviews referenced tables', `
  SELECT c.relname AS referencing, a.attname AS column
  FROM pg_constraint con
  JOIN pg_class c ON c.oid = con.conrelid
  JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = con.conkey[1]
  WHERE con.contype='f' AND con.confrelid='public.reviews'::regclass
`)

await q('reviews row count', `SELECT count(*)::int AS n FROM public.reviews`)

await c.end()