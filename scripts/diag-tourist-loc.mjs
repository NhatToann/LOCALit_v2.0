#!/usr/bin/env node
import { Client } from 'pg'

const pw = process.env.DB_PW || process.env.SUPABASE_DB_PASSWORD
if (!pw) { console.error('Set DB_PW'); process.exit(1) }
const pg = new Client({ host: 'db.pqvnjgyqbxlylawwogjv.supabase.co', port: 5432, user: 'postgres', password: pw, database: 'postgres', ssl: { rejectUnauthorized: false } })
await pg.connect()

const t = await pg.query(`
  SELECT st.id, p.full_name, p.email, st.location_city, st.latitude, st.longitude,
         st.nationality, st.languages, st.interests
  FROM public.safe_tourists_with_location st
  JOIN public.profiles p ON p.id = st.id
  ORDER BY p.full_name
`)
console.log('=== safe_tourists_with_location ===')
console.table(t.rows)

const b = await pg.query(`
  SELECT sb.id, p.full_name, p.email, sb.location_city, sb.latitude, sb.longitude
  FROM public.safe_buddies sb
  JOIN public.profiles p ON p.id = sb.id
  ORDER BY p.full_name
`)
console.log('=== safe_buddies (unchanged) ===')
console.table(b.rows)

await pg.end()
