// scripts/diag-connections-fk.mjs
import pg from 'pg'
const { Client } = pg
const c = new Client({
  connectionString: `postgresql://postgres:${process.env.DB_PW}@db.pqvnjgyqbxlylawwogjv.supabase.co:5432/postgres`,
  ssl: { rejectUnauthorized: false },
})
await c.connect()

// 1) Does the buddies table have is_online column?
const buddyCols = await c.query(`
  SELECT column_name, data_type
  FROM information_schema.columns
  WHERE table_schema='public' AND table_name='buddies'
  ORDER BY ordinal_position
`)
console.log('buddies columns:')
for (const r of buddyCols.rows) console.log(' ', r.column_name, r.data_type)

// 2) Connections FKs to buddies
const fks = await c.query(`
  SELECT
    tc.constraint_name,
    kcu.column_name,
    ccu.table_schema AS foreign_table_schema,
    ccu.table_name   AS foreign_table_name,
    ccu.column_name  AS foreign_column_name
  FROM information_schema.table_constraints AS tc
  JOIN information_schema.key_column_usage AS kcu
    ON tc.constraint_name = kcu.constraint_name
    AND tc.table_schema   = kcu.table_schema
  JOIN information_schema.constraint_column_usage AS ccu
    ON ccu.constraint_name = tc.constraint_name
    AND ccu.table_schema   = tc.table_schema
  WHERE tc.constraint_type='FOREIGN KEY'
    AND tc.table_schema='public'
    AND tc.table_name='connections'
  ORDER BY kcu.column_name
`)
console.log('\nconnections FKs:')
for (const r of fks.rows) console.log(' ', r.column_name, '->', r.foreign_table_schema + '.' + r.foreign_table_name + '.' + r.foreign_column_name)

// 3) Show what columns are in connections
const connCols = await c.query(`
  SELECT column_name, data_type, is_nullable
  FROM information_schema.columns
  WHERE table_schema='public' AND table_name='connections'
  ORDER BY ordinal_position
`)
console.log('\nconnections columns:')
for (const r of connCols.rows) console.log(' ', r.column_name, r.data_type, r.is_nullable)

await c.end()
