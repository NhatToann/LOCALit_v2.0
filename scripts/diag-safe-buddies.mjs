import pg from 'pg'
const { Client } = pg
const c = new Client({
  connectionString: `postgresql://postgres:${process.env.DB_PW}@db.pqvnjgyqbxlylawwogjv.supabase.co:5432/postgres`,
  ssl: { rejectUnauthorized: false },
})
await c.connect()
const r = await c.query(`
  SELECT column_name, data_type
  FROM information_schema.columns
  WHERE table_schema='public' AND table_name='safe_buddies'
  ORDER BY ordinal_position
`)
console.log('safe_buddies columns:')
for (const row of r.rows) console.log(' ', row.column_name, row.data_type)

// RLS policies
const pol = await c.query(`
  SELECT policyname, cmd, qual
  FROM pg_policies
  WHERE schemaname='public' AND tablename='safe_buddies'
  ORDER BY policyname
`)
console.log('\nsafe_buddies policies:')
for (const row of pol.rows) console.log(' ', row.policyname, 'cmd=', row.cmd, 'qual=', row.qual)

await c.end()
