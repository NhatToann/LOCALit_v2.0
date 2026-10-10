import { Client } from 'pg'

const c = new Client({
  connectionString: 'postgresql://postgres:that1arlecchino@db.pqvnjgyqbxlylawwogjv.supabase.co:5432/postgres',
  ssl: { rejectUnauthorized: false },
})

await c.connect()

const def = await c.query(`
  SELECT pg_get_viewdef('public.safe_profiles'::regclass, true) AS def
`)
console.log('=== safe_profiles definition ===')
console.log(def.rows[0].def)

// Which rows back the avatar you saw in the DOM?
const rows = await c.query(`
  SELECT id, full_name, role, coalesce(avatar_url,'(null)') AS avatar
  FROM public.safe_profiles
  WHERE full_name ILIKE '%Lan%' OR full_name ILIKE '%Pham%'
  ORDER BY full_name
`)
console.log('\n=== safe_profiles: Lan Pham ===')
for (const r of rows.rows) console.log(`${r.id} | ${r.full_name} | ${r.role} | ${r.avatar}`)

await c.end()