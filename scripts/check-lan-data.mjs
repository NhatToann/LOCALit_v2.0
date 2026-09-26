import { Client } from 'pg'
const c = new Client({
  host: 'db.pqvnjgyqbxlylawwogjv.supabase.co',
  port: 5432,
  user: 'postgres',
  password: 'that1arlecchino',
  database: 'postgres',
  ssl: { rejectUnauthorized: false },
})
async function main() {
  await c.connect()
  const r = await c.query(`
    SELECT b.id, b.location_city, b.languages, b.specialties, b.hourly_rate, b.bio,
           p.full_name, p.bio AS profile_bio, p.phone, p.is_online
    FROM public.buddies b
    LEFT JOIN public.profiles p ON p.id = b.id
    WHERE p.full_name = 'Lan Pham'
  `)
  console.log('Lan Pham data:', JSON.stringify(r.rows, null, 2))
  await c.end()
}
main().catch(e => { console.error(e); process.exit(1) })
