// reseed-portrait-avatars.mjs — use randomuser.me for portrait avatars
import { Client } from 'pg'

const pg = new Client({
  connectionString: 'postgresql://postgres:that1arlecchino@db.pqvnjgyqbxlylawwogjv.supabase.co:5432/postgres',
  ssl: { rejectUnauthorized: false },
})
await pg.connect()
const { rows: profiles } = await pg.query(`
  SELECT id, full_name, role
  FROM public.profiles
  WHERE avatar_url IS NOT NULL
  ORDER BY full_name
`)
console.log(`Refreshing ${profiles.length} existing avatars to randomuser.me`)

// randomuser.me provides stable per-seed face photos
let updated = 0
for (const p of profiles) {
  // Use a stable seed so the same face stays mapped to the same user.
  // randomuser.me/api/portraits/<gender>/<num>.jpg → stable URL per num
  const roleTag = p.role === 'buddy' ? 'men' : 'women'
  // Use the first 2 hex digits of the id to pick a number 0..99
  const num = parseInt(p.id.replace(/-/g, '').slice(0, 4), 16) % 100
  const url = `https://randomuser.me/api/portraits/${roleTag}/${num}.jpg`
  await pg.query(
    'UPDATE public.profiles SET avatar_url = $1 WHERE id = $2',
    [url, p.id],
  )
  updated++
}

console.log(`Done. updated=${updated}`)
await pg.end()
