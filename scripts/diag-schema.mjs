import pg from 'pg'
const c = new pg.Client({
  connectionString: 'postgresql://postgres:that1arlecchino@db.pqvnjgyqbxlylawwogjv.supabase.co:5432/postgres',
  ssl: { rejectUnauthorized: false },
})
await c.connect()

const tables = [
  'profiles', 'tourists', 'buddies', 'connections', 'conversations',
  'messages', 'reviews', 'location_updates', 'trips', 'trip_stops',
  'swipes', 'matches', 'email_verifications', 'pending_calls',
]
const { rows } = await c.query(
  `SELECT table_name, string_agg(column_name, ', ' ORDER BY ordinal_position) AS cols
     FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = ANY($1::text[])
    GROUP BY table_name ORDER BY table_name`,
  [tables],
)
for (const r of rows) console.log(`${r.table_name}:\n  ${r.cols}\n`)

// Which tables have a column referencing auth.users?
const { rows: fks } = await c.query(
  `SELECT tc.table_name, kcu.column_name, rc.delete_rule
     FROM information_schema.table_constraints tc
     JOIN information_schema.key_column_usage kcu
       ON tc.constraint_name = kcu.constraint_name
     JOIN information_schema.referential_constraints rc
       ON tc.constraint_name = rc.constraint_name
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND kcu.position_in_unique_constraint IS NOT NULL
      AND rc.unique_constraint_name IN (
        SELECT constraint_name FROM information_schema.table_constraints
         WHERE table_schema = 'auth' AND table_name = 'users'
      )
    ORDER BY tc.table_name`,
)
console.log('FKs referencing auth.users:')
for (const f of fks) console.log(`  ${f.table_name}.${f.column_name}  ON DELETE ${f.delete_rule}`)

await c.end()