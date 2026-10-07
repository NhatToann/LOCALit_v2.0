import { Client } from 'pg'

const client = new Client({
  connectionString: `postgresql://postgres:that1arlecchino@db.pqvnjgyqbxlylawwogjv.supabase.co:5432/postgres`,
  ssl: { rejectUnauthorized: false },
})
await client.connect()

// 1. Find Lan Pham (the tourist from the screenshot) and her buddy row
const { rows: lan } = await client.query(`
  SELECT u.id AS user_id, u.email, p.full_name, p.role,
         b.id AS buddy_id, b.is_available AS buddy_is_available,
         b.latitude IS NOT NULL AS has_lat,
         b.longitude IS NOT NULL AS has_lng
  FROM auth.users u
  LEFT JOIN public.profiles p ON p.id = u.id
  LEFT JOIN public.buddies b  ON b.id = u.id
  WHERE p.full_name ILIKE '%lan pham%' OR u.email ILIKE '%lan%pham%' OR u.email ILIKE '%pham%'
  ORDER BY u.email
`)
console.log('Lan Pham candidate:', JSON.stringify(lan, null, 2))

// 2. List all buddies row visibility to confirm the fix
const { rows: buddies } = await client.query(`
  SELECT id, is_available,
         latitude IS NOT NULL AS has_lat,
         longitude IS NOT NULL AS has_lng
  FROM public.buddies
  ORDER BY id
`)
console.log('All buddies in public.buddies:')
for (const r of buddies) {
  console.log(' ', r.id, 'is_available=' + r.buddy_is_available, 'lat=' + r.has_lat, 'lng=' + r.has_lng,
              '→ visible in safe_buddies:', r.buddy_is_available && r.has_lat && r.has_lng)
}

// 3. Show current safe_buddies view definition to confirm fix
const { rows: vd } = await client.query(`
  SELECT view_definition FROM information_schema.views
  WHERE table_schema = 'public' AND table_name = 'safe_buddies'
`)
console.log('safe_buddies view definition:')
console.log(vd[0]?.view_definition ?? '(not found)')

await client.end()
