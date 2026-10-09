// diag-lan-john-conv.mjs
import pg from 'pg'
const {Client} = pg
const c = new Client({
  connectionString: `postgresql://postgres:${process.env.DB_PW}@db.pqvnjgyqbxlylawwogjv.supabase.co:5432/postgres`,
  ssl: { rejectUnauthorized: false }
})
await c.connect()

// buddies.id is the primary key AND references profiles.id (1:1)
const lanBuddy = await c.query(`SELECT b.id FROM public.buddies b JOIN public.profiles p ON p.id=b.id WHERE p.full_name ILIKE '%lan%' LIMIT 1`)
const johnTourist = await c.query(`SELECT t.id FROM public.tourists t JOIN public.profiles p ON p.id=t.id WHERE p.email='john.doe@example.com' LIMIT 1`)
console.log('lan buddy:', lanBuddy.rows[0]?.id, 'john tourist:', johnTourist.rows[0]?.id)

const lanBuddyId = lanBuddy.rows[0]?.id
const johnTouristId = johnTourist.rows[0]?.id
if (lanBuddyId && johnTouristId) {
  const exist = await c.query(
    `SELECT id FROM public.conversations WHERE tourist_id=$1 AND buddy_id=$2`,
    [johnTouristId, lanBuddyId],
  )
  if (exist.rows.length === 0) {
    await c.query(
      `INSERT INTO public.conversations (tourist_id, buddy_id) VALUES ($1, $2)`,
      [johnTouristId, lanBuddyId],
    )
    console.log('inserted conversation between john and lan')
  } else {
    console.log('conversation already exists:', exist.rows[0].id)
  }
}

await c.end()
