import pg from 'pg'
const { Client } = pg
const c = new Client({
  connectionString: `postgresql://postgres:${process.env.DB_PW}@db.pqvnjgyqbxlylawwogjv.supabase.co:5432/postgres`,
  ssl: { rejectUnauthorized: false },
})
await c.connect()

// 1) Is connections.buddy_id a uuid that actually equals some buddies.id?
const r = await c.query(`
  SELECT c.id, c.tourist_id, c.buddy_id,
    EXISTS(SELECT 1 FROM public.buddies b WHERE b.id = c.buddy_id) AS buddy_exists,
    EXISTS(SELECT 1 FROM public.tourists t WHERE t.id = c.tourist_id) AS tourist_exists
  FROM public.connections c
`)
console.log('connection rows:')
for (const row of r.rows) {
  console.log(' ', row.id.slice(0,8), 'tourist=', row.tourist_id.slice(0,8), 'buddy=', row.buddy_id.slice(0,8),
    'buddy_exists=', row.buddy_exists, 'tourist_exists=', row.tourist_exists)
}

// 2) Are there any null buddy_id?
const nulls = await c.query(`SELECT COUNT(*) FROM public.connections WHERE buddy_id IS NULL`)
console.log('\nnull buddy_ids:', nulls.rows[0].count)

// 3) Count total
const tot = await c.query(`SELECT COUNT(*) FROM public.connections`)
console.log('total connections:', tot.rows[0].count)

await c.end()
