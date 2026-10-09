import { Client } from 'pg'
const pw = process.env.DB_PW || process.env.SUPABASE_DB_PASSWORD
const pg = new Client({ host: 'db.pqvnjgyqbxlylawwogjv.supabase.co', port: 5432, user: 'postgres', password: pw, database: 'postgres', ssl: { rejectUnauthorized: false } })
await pg.connect()
const r = await pg.query("SELECT p.full_name, t.* FROM public.tourists t JOIN public.profiles p ON p.id = t.id WHERE t.location_city IS NULL ORDER BY p.full_name")
console.log('=== Tourists without location_city ===')
console.table(r.rows.map(x => ({ name: x.full_name, lat: x.latitude, lng: x.longitude, city: x.location_city, dest: x.destination })))
await pg.end()
