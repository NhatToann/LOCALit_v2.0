const { Client } = require('pg')
;(async () => {
  const c = new Client({
    connectionString:
      'postgresql://postgres:that1arlecchino@db.pqvnjgyqbxlylawwogjv.supabase.co:5432/postgres',
    ssl: { rejectUnauthorized: false },
  })
  await c.connect()
  const r = await c.query(
    "SELECT p.id, p.email, p.full_name, p.role, CASE WHEN b.id IS NOT NULL THEN 'has_buddy' WHEN t.id IS NOT NULL THEN 'has_tourist' END as ext FROM public.profiles p LEFT JOIN public.buddies b ON b.id=p.id LEFT JOIN public.tourists t ON t.id=p.id ORDER BY p.role DESC, p.email"
  )
  console.log('Total:', r.rows.length)
  console.table(r.rows)
  await c.end()
})()
