// scripts/diag-tourist-tourist-conv.mjs
// Insert a tourist↔tourist conversation to verify the relaxed FK works
import pg from 'pg'
const { Client } = pg
const c = new Client({
  connectionString: `postgresql://postgres:${process.env.DB_PW}@db.pqvnjgyqbxlylawwogjv.supabase.co:5432/postgres`,
  ssl: { rejectUnauthorized: false },
})
await c.connect()

// Two tourists: e2e-real (db199dc5...) and Phan Nhật Toàn (f2df98b0...)
const t1 = 'db199dc5-d50a-423d-8010-8111ee36050a'
const t2 = 'f2df98b0-96cf-451d-9d85-5060ddc1ca01'

const exist = await c.query(
  `SELECT id FROM public.conversations WHERE tourist_id IN ($1, $2) AND buddy_id IN ($1, $2)`,
  [t1, t2],
)
console.log('existing tourist↔tourist conv:', exist.rows.length === 0 ? 'none' : exist.rows[0].id)

if (exist.rows.length === 0) {
  try {
    const ins = await c.query(
      `INSERT INTO public.conversations (tourist_id, buddy_id) VALUES ($1, $2) RETURNING id`,
      [t1, t2],
    )
    console.log('INSERTED tourist↔tourist conversation:', ins.rows[0].id)
  } catch (e) {
    console.error('insert failed:', e.message)
  }
}

// Try also buddy↔buddy
const b1 = '11111111-1111-1111-1111-111111111111' // Lan
const b2 = '33333333-3333-3333-3333-333333333333' // Huy
const exist2 = await c.query(
  `SELECT id FROM public.conversations WHERE tourist_id IN ($1, $2) AND buddy_id IN ($1, $2)`,
  [b1, b2],
)
if (exist2.rows.length === 0) {
  try {
    const ins = await c.query(
      `INSERT INTO public.conversations (tourist_id, buddy_id) VALUES ($1, $2) RETURNING id`,
      [b1, b2],
    )
    console.log('INSERTED buddy↔buddy conversation:', ins.rows[0].id)
  } catch (e) {
    console.error('buddy↔buddy insert failed:', e.message)
  }
} else {
  console.log('existing buddy↔buddy conv:', exist2.rows[0].id)
}

await c.end()
