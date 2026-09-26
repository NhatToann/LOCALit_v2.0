import { Client } from 'pg'
const c = new Client({
  connectionString: `postgresql://postgres:${process.env.DB_PW}@db.pqvnjgyqbxlylawwogjv.supabase.co:5432/postgres`,
  ssl: { rejectUnauthorized: false },
})
await c.connect()
const r = await c.query(`SELECT grantee, table_name, privilege_type, column_name
FROM information_schema.role_column_grants
WHERE grantee='anon' AND table_schema='public' AND table_name IN ('tourists','buddies','profiles','reviews')
ORDER BY table_name, column_name`)
console.log(JSON.stringify(r.rows, null, 2))
const r2 = await c.query(`SELECT grantee, table_name, privilege_type
FROM information_schema.role_table_grants
WHERE grantee='anon' AND table_schema='public' AND table_name IN ('tourists','buddies','profiles','reviews')
ORDER BY table_name`)
console.log('table-level:', JSON.stringify(r2.rows, null, 2))
await c.end()
