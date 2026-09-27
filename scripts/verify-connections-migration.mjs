import { Client } from 'pg'

const c = new Client({
  connectionString: `postgresql://postgres:${process.env.SUPABASE_DB_PASSWORD}@db.pqvnjgyqbxlylawwogjv.supabase.co:5432/postgres`,
  ssl: { rejectUnauthorized: false },
})
await c.connect()

const conn = await c.query(
  `SELECT column_name, data_type
     FROM information_schema.columns
     WHERE table_name='connections'
       AND column_name IN ('lifecycle','accepted_at','ended_at','renewed_by_tourist_at','renewed_by_buddy_at','end_reason')
     ORDER BY column_name`,
)
console.log('Connections columns:', conn.rows)

const fav = await c.query(
  `SELECT column_name, data_type
     FROM information_schema.columns
     WHERE table_name='buddies'
       AND column_name='favorite_places'`,
)
console.log('Buddies favorite_places:', fav.rows)

const itin = await c.query(
  `SELECT column_name, data_type
     FROM information_schema.columns
     WHERE table_name='trips'
       AND column_name LIKE 'itinerary%'`,
)
console.log('Trips itinerary cols:', itin.rows)

const lc = await c.query(
  `SELECT enumlabel FROM pg_enum
     WHERE enumtypid=(SELECT oid FROM pg_type WHERE typname='connection_lifecycle')
     ORDER BY enumsortorder`,
)
console.log('Lifecycle enum values:', lc.rows)

const triggers = await c.query(
  `SELECT tgname FROM pg_trigger
     WHERE tgrelid='public.connections'::regclass AND NOT tgisinternal
     ORDER BY tgname`,
)
console.log('Connections triggers:', triggers.rows)

await c.end()
