import pg from 'pg'
const {Client} = pg
const c = new Client({
  connectionString: `postgresql://postgres:${process.env.DB_PW}@db.pqvnjgyqbxlylawwogjv.supabase.co:5432/postgres`,
  ssl: { rejectUnauthorized: false }
})
await c.connect()

// phan nhat toan is the tourist (f2df98b0...)
// lan pham is the buddy (11111111...)
const phanTourist = await c.query(`SELECT t.id FROM public.tourists t WHERE t.id='f2df98b0-96cf-451d-9d85-5060ddc1ca01'`)
const lanBuddy = await c.query(`SELECT b.id FROM public.buddies b WHERE b.id='11111111-1111-1111-1111-111111111111'`)
console.log('phan tourist row:', phanTourist.rows[0]?.id, 'lan buddy row:', lanBuddy.rows[0]?.id)

if (phanTourist.rows[0]?.id && lanBuddy.rows[0]?.id) {
  const exist = await c.query(
    `SELECT id FROM public.conversations WHERE tourist_id=$1 AND buddy_id=$2`,
    [phanTourist.rows[0].id, lanBuddy.rows[0].id],
  )
  if (exist.rows.length === 0) {
    await c.query(
      `INSERT INTO public.conversations (tourist_id, buddy_id) VALUES ($1, $2)`,
      [phanTourist.rows[0].id, lanBuddy.rows[0].id],
    )
    console.log('inserted conversation phan <-> lan')
  } else {
    console.log('conversation already exists:', exist.rows[0].id)
  }
}
await c.end()
