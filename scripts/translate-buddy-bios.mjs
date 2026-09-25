// Translate the Vietnamese bios on the Da Nang buddies + demo connection/trip titles.
// Re-runnable, idempotent.

import { Client } from 'pg'

const UPDATES = [
  {
    email: 'lan.pham.buddy@gmail.com',
    bio: 'Born and raised in Da Nang — I will show you the best local eateries and the most unique cultural spots in the city.',
  },
  {
    email: 'linh.nguyen.buddy@gmail.com',
    bio: 'Nature lover and adventure guide — I will take you to explore Ba Na Hills and the Son Tra peninsula.',
  },
]

const pg = new Client({
  connectionString: 'postgresql://postgres:that1arlecchino@db.pqvnjgyqbxlylawwogjv.supabase.co:5432/postgres',
  ssl: { rejectUnauthorized: false },
})

async function main() {
  await pg.connect()

  for (const u of UPDATES) {
    const r = await pg.query(
      `UPDATE public.buddies b
       SET bio = $1
       FROM auth.users u
       WHERE u.id = b.id AND u.email = $2`,
      [u.bio, u.email]
    )
    console.log(`Updated bio for ${u.email} (${r.rowCount} row)`)
  }

  // Demo connection message
  await pg.query(
    `UPDATE public.connections
     SET message = 'Demo connection from Lan Pham'
     WHERE message = 'Demo connection từ Lan Pham'`
  ).then(r => console.log(`Connection messages updated: ${r.rowCount}`))

  // Demo trip title
  await pg.query(
    `UPDATE public.trips
     SET title = 'Explore Da Nang'
     WHERE title = 'Khám phá Đà Nẵng'`
  ).then(r => console.log(`Trip titles updated: ${r.rowCount}`))

  await pg.end()
  console.log('\n✓ Translation reseed complete')
}

main().catch(err => { console.error(err); process.exit(1) })
