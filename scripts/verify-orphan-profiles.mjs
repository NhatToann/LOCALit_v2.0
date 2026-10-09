import { Client } from 'pg'
const c = new Client({
  connectionString: `postgresql://postgres:${process.env.SUPABASE_DB_PASSWORD}@db.pqvnjgyqbxlylawwogjv.supabase.co:5432/postgres`,
  ssl: { rejectUnauthorized: false },
})
await c.connect()

console.log('=== Profiles WITHOUT matching role-table row ===')
const { rows } = await c.query(`
  SELECT p.id, p.full_name, p.role,
         EXISTS(SELECT 1 FROM public.tourists t WHERE t.id = p.id) AS has_tourist_row,
         EXISTS(SELECT 1 FROM public.buddies   b WHERE b.id = p.id) AS has_buddy_row
  FROM public.profiles p
  ORDER BY p.role, p.full_name
`)
console.log('Total profiles:', rows.length)
rows.forEach(r => {
  const flag =
    (r.role === 'tourist' && !r.has_tourist_row) ||
    (r.role === 'buddy' && !r.has_buddy_row)
      ? ' <- ORPHAN' : ''
  console.log('  -', r.full_name.padEnd(20), r.role.padEnd(8), 'tourist:', r.has_tourist_row, 'buddy:', r.has_buddy_row, flag)
})

await c.end()
