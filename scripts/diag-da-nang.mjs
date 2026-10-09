import { Client } from 'pg'
const pw = process.env.DB_PW || process.env.SUPABASE_DB_PASSWORD
const pg = new Client({ host: 'db.pqvnjgyqbxlylawwogjv.supabase.co', port: 5432, user: 'postgres', password: pw, database: 'postgres', ssl: { rejectUnauthorized: false } })
await pg.connect()
const b = await pg.query("SELECT p.full_name, sb.id, sb.location_city, sb.specialties FROM public.safe_buddies sb JOIN public.profiles p ON p.id = sb.id WHERE sb.location_city = 'Da Nang' ORDER BY p.full_name")
console.log('=== Da Nang BUDDIES ===')
console.table(b.rows)
const t = await pg.query("SELECT p.full_name, st.id, st.location_city, st.interests FROM public.safe_tourists_with_location st JOIN public.profiles p ON p.id = st.id WHERE st.location_city = 'Da Nang' ORDER BY p.full_name")
console.log('=== Da Nang TOURISTS ===')
console.table(t.rows)
await pg.end()
