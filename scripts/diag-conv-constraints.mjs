import pg from 'pg'
const { Client } = pg
const c = new Client({
  connectionString: `postgresql://postgres:${process.env.DB_PW}@db.pqvnjgyqbxlylawwogjv.supabase.co:5432/postgres`,
  ssl: { rejectUnauthorized: false },
})
await c.connect()
const r = await c.query(`
  SELECT
    tc.constraint_name,
    tc.constraint_type,
    kcu.column_name,
    ccu.table_schema AS foreign_table_schema,
    ccu.table_name   AS foreign_table_name,
    ccu.column_name  AS foreign_column_name,
    rc.update_rule,
    rc.delete_rule
  FROM information_schema.table_constraints AS tc
  JOIN information_schema.key_column_usage AS kcu
    ON tc.constraint_name = kcu.constraint_name
    AND tc.table_schema   = kcu.table_schema
  JOIN information_schema.constraint_column_usage AS ccu
    ON ccu.constraint_name = tc.constraint_name
    AND ccu.table_schema   = tc.table_schema
  LEFT JOIN information_schema.referential_constraints rc
    ON rc.constraint_name = tc.constraint_name
  WHERE tc.table_schema='public' AND tc.table_name='conversations'
  ORDER BY kcu.column_name
`)
console.log('conversations constraints:')
for (const row of r.rows) console.log(' ', row.constraint_type, row.constraint_name, row.column_name, '->', row.foreign_table_schema + '.' + row.foreign_table_name + '.' + row.foreign_column_name, 'update=' + row.update_rule, 'delete=' + row.delete_rule)
await c.end()
