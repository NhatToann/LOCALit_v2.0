// diag-safe-profiles.mjs — see what safe_profiles returns
import { Client } from 'pg'
const pg = new Client({
  connectionString: 'postgresql://postgres:that1arlecchino@db.pqvnjgyqbxlylawwogjv.supabase.co:5432/postgres',
  ssl: { rejectUnauthorized: false },
})
await pg.connect()

// 1. Definition of safe_profiles view
const v = await pg.query(`
  SELECT view_definition
  FROM information_schema.views
  WHERE table_schema = 'public' AND table_name = 'safe_profiles'`)
console.log('=== safe_profiles view definition ===')
console.log(v.rows[0]?.view_definition ?? '(not found)')

// 2. All profiles with avatar_url
const p = await pg.query(`
  SELECT id, full_name, role, avatar_url, is_online
  FROM public.profiles
  ORDER BY full_name
  LIMIT 20`)
console.log('\n=== profiles (20) ===')
for (const r of p.rows) console.log(JSON.stringify(r))

await pg.end()
