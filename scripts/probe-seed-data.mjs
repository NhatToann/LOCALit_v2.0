import { Client } from 'pg'
const c = new Client({
  connectionString: `postgresql://postgres:${process.env.DB_PW}@db.pqvnjgyqbxlylawwogjv.supabase.co:5432/postgres`,
  ssl: { rejectUnauthorized: false },
})
await c.connect()

console.log('=== Seed accounts (auth.users + profiles) ===')
const u = await c.query(`SELECT u.id, u.email, p.role, p.full_name FROM auth.users u LEFT JOIN public.profiles p ON p.id=u.id ORDER BY p.role, u.email`)
console.log(u.rows)

console.log('\n=== Sample buddies ===')
const b = await c.query(`SELECT b.id, b.location_city, b.hourly_rate, p.full_name FROM public.buddies b LEFT JOIN public.profiles p ON p.id=b.id ORDER BY p.full_name LIMIT 10`)
console.log(b.rows)

console.log('\n=== Sample tourists ===')
const t = await c.query(`SELECT t.id, t.nationality, p.full_name FROM public.tourists t LEFT JOIN public.profiles p ON p.id=t.id ORDER BY p.full_name LIMIT 5`)
console.log(t.rows)

console.log('\n=== Trips ===')
const tr = await c.query(`SELECT id, name, status, destination, start_date FROM public.trips ORDER BY start_date DESC LIMIT 10`)
console.log(tr.rows)

console.log('\n=== Sample reviews (so we have a trip to review) ===')
const rv = await c.query(`SELECT id, trip_id, rating, comment FROM public.reviews LIMIT 5`)
console.log(rv.rows)

await c.end()
