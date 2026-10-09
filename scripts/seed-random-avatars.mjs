// seed-random-avatars.mjs — set avatars to Picsum URLs directly in DB
// (bypasses Storage because the service role key is redacted locally).
// The image is a stable random portrait per user, served from picsum.photos
// which is CORS-friendly. Idempotent — users with an existing avatar_url
// are skipped.
import { Client } from 'pg'

const pg = new Client({
  connectionString: 'postgresql://postgres:that1arlecchino@db.pqvnjgyqbxlylawwogjv.supabase.co:5432/postgres',
  ssl: { rejectUnauthorized: false },
})
await pg.connect()
const { rows: profiles } = await pg.query(`
  SELECT id, full_name, role
  FROM public.profiles
  WHERE avatar_url IS NULL
  ORDER BY full_name
`)
console.log(`Found ${profiles.length} profiles without avatars`)

// picsum.photos/seed/<seed>/256/256 serves a stable random photo per seed.
const PICSUM = 'https://picsum.photos/seed'

let updated = 0
for (const p of profiles) {
  // Pick a per-user seed that includes the role so tourists and buddies
  // never collide on the same face.
  const roleTag = p.role === 'buddy' ? 'b' : 't'
  const seed = `${roleTag}-${p.id}`
  const url = `${PICSUM}/${encodeURIComponent(seed)}/256/256`
  const upd = await pg.query(
    'UPDATE public.profiles SET avatar_url = $1 WHERE id = $2 AND avatar_url IS NULL',
    [url, p.id],
  )
  if (upd.rowCount && upd.rowCount > 0) {
    console.log(`  [${p.full_name}] ${p.role} -> ${url}`)
    updated++
  } else {
    console.log(`  [${p.full_name}] (already had avatar, skipped)`)
  }
}

console.log(`\nDone. updated=${updated}`)
await pg.end()
