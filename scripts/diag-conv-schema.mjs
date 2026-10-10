import pg from 'pg'
const {Client} = pg
const c = new Client({
  connectionString:'postgresql://postgres:that1arlecchino@db.pqvnjgyqbxlylawwogjv.supabase.co:5432/postgres',
  ssl:{rejectUnauthorized:false}
})
c.connect().then(async () => {
  const r = await c.query(`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_schema='public' AND table_name='conversations'
    ORDER BY ordinal_position
  `)
  console.log('=== public.conversations columns ===')
  r.rows.forEach(x => console.log(`  ${x.column_name.padEnd(26)} ${x.data_type}`))

  const g = await c.query(`
    SELECT c.relname AS table, a.attname AS col, pg_get_expr(ad.adbin, ad.adrelid) AS grant_stmt
    FROM pg_attribute a
    JOIN pg_class c ON c.oid = a.attrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    LEFT JOIN pg_attrdef ad ON ad.adrelid = a.attrelid AND ad.adnum = a.attnum
    WHERE n.nspname='public' AND c.relname='conversations' AND a.attnum > 0
      AND pg_get_expr(ad.adbin, ad.adrelid) ILIKE '%last_message%'
  `)
  console.log('\n=== column DEFAULTs referencing last_message ===')
  g.rows.forEach(x => console.log(`  ${x.table}.${x.col} => ${x.grant_stmt}`))

  await c.end()
}).catch(e => { console.error(e.message); process.exit(1) })