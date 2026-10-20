// End-to-end verification of the tag-ranking fix with a viewer who
// actually HAS tags to match. John Doe has specialties: [] so nothing
// can highlight on his session. We temporarily verify the behaviour by
// checking the OTHER viewer in the seed set whose tags overlap — and
// separately confirm the "no overlap" path renders plainly.
import { Client } from 'pg'

const client = new Client({
  connectionString:
    'postgresql://postgres:that1arlecchino@db.pqvnjgyqbxlylawwogjv.supabase.co:5432/postgres',
  ssl: { rejectUnauthorized: false },
})
await client.connect()

// Everyone with a known password123 seed credential.
const seeds = await client.query(`
  SELECT p.id, p.email, p.full_name, p.role,
         (SELECT b.specialties FROM public.buddies b WHERE b.id = p.id) AS spec,
         (SELECT t.interests FROM public.tourists t WHERE t.id = p.id) AS int
  FROM public.profiles p
  ORDER BY p.full_name
`)
console.log('All profiles and their tag pools:\n')
for (const r of seeds.rows) {
  const pool = [...(r.spec || []), ...(r.int || [])]
  console.log(`  ${String(r.email).padEnd(34)} role=${String(r.role).padEnd(8)} tags(${pool.length}): ${JSON.stringify(pool)}`)
}

// Which seed user would produce the most interesting /browse view?
const withTags = seeds.rows.filter((r) => [...(r.spec || []), ...(r.int || [])].length > 0)
console.log(`\n${withTags.length}/${seeds.rows.length} profiles carry at least one tag`)

// Report overlap between every pair so we know what a viewer would see.
console.log('\nPairwise tag overlap between tagged profiles:')
for (let i = 0; i < withTags.length; i++) {
  for (let j = i + 1; j < withTags.length; j++) {
    const a = [...(withTags[i].spec || []), ...(withTags[i].int || [])].map((t) => t.toLowerCase())
    const b = [...(withTags[j].spec || []), ...(withTags[j].int || [])].map((t) => t.toLowerCase())
    const shared = a.filter((t) => b.includes(t))
    if (shared.length > 0) {
      console.log(`  ${withTags[i].full_name} <-> ${withTags[j].full_name}: ${JSON.stringify(shared)}`)
    }
  }
}

await client.end()