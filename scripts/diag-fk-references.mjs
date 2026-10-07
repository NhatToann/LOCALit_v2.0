import { Client } from 'pg'
const c = new Client({
  connectionString: `postgresql://postgres:${process.env.DB_PW}@db.pqvnjgyqbxlylawwogjv.supabase.co:5432/postgres`,
  ssl: { rejectUnauthorized: false },
})
await c.connect()

// Find ALL FK constraints referencing the 3 candidate tables
const fks = await c.query(`
  SELECT
    tc.table_schema AS source_schema,
    tc.table_name AS source_table,
    tc.constraint_name,
    kcu.column_name AS source_column,
    ccu.table_schema AS target_schema,
    ccu.table_name AS target_table,
    ccu.column_name AS target_column,
    rc.delete_rule,
    rc.update_rule
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu
    ON tc.constraint_name = kcu.constraint_name
    AND tc.table_schema = kcu.table_schema
  JOIN information_schema.referential_constraints rc
    ON tc.constraint_name = rc.constraint_name
  JOIN information_schema.constraint_column_usage ccu
    ON rc.unique_constraint_name = ccu.constraint_name
  WHERE tc.constraint_type = 'FOREIGN KEY'
    AND ccu.table_name IN ('trip_bookings','trip_budget','webrtc_signals')
  ORDER BY ccu.table_name, tc.table_name
`)
console.log('FKs referencing the 3 candidate tables:')
console.log(JSON.stringify(fks.rows, null, 2))

// For each candidate, also check if it has FKs to other tables (so drop order matters)
const reverse = await c.query(`
  SELECT
    tc.table_name AS from_table,
    kcu.column_name AS from_column,
    ccu.table_name AS to_table,
    ccu.column_name AS to_column
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu
    ON tc.constraint_name = kcu.constraint_name
    AND tc.table_schema = kcu.table_schema
  JOIN information_schema.constraint_column_usage ccu
    ON ccu.constraint_name = tc.constraint_name
    AND ccu.table_schema = tc.table_schema
  WHERE tc.constraint_type = 'FOREIGN KEY'
    AND tc.table_schema = 'public'
    AND tc.table_name IN ('trip_bookings','trip_budget','webrtc_signals')
`)
console.log('\nFKs FROM the 3 candidate tables to others:')
console.log(JSON.stringify(reverse.rows, null, 2))

await c.end()
