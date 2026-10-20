import pg from 'pg'
const c = new pg.Client({
  connectionString: 'postgresql://postgres:that1arlecchino@db.pqvnjgyqbxlylawwogjv.supabase.co:5432/postgres',
  ssl: { rejectUnauthorized: false },
})
await c.connect()

const { rows } = await c.query(
  `SELECT table_name,
          (SELECT count(*)::int FROM information_schema.columns k
            WHERE k.table_schema='public' AND k.table_name = t.table_name) AS cols
     FROM information_schema.tables t
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY table_name`,
)
console.log('public tables:')
for (const r of rows) console.log(`  ${r.table_name} (${r.cols} cols)`)

const { rows: views } = await c.query(
  `SELECT table_name FROM information_schema.views WHERE table_schema='public' ORDER BY table_name`,
)
console.log('\npublic views:')
for (const v of views) console.log(`  ${v.table_name}`)

// Anything at all that stores a uuid pointing at a user we are deleting?
const { rows: refs } = await c.query(
  `SELECT tc.table_name, kcu.column_name, ccu.table_name AS ref_table, ccu.column_name AS ref_col
     FROM information_schema.table_constraints tc
     JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
     JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND tc.table_schema = 'public'
      AND ccu.table_name = 'profiles'
    ORDER BY tc.table_name`,
)
console.log('\npublic FKs → profiles.id (these cascade from profiles):')
for (const r of refs) console.log(`  ${r.table_name}.${r.column_name}`)

await c.end()