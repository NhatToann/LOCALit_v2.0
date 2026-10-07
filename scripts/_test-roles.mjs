import { Client } from 'pg'
const c = new Client({
  host: 'db.pqvnjgyqbxlylawwogjv.supabase.co',
  port: 5432,
  user: 'postgres',
  password: process.env.DB_PW,
  database: 'postgres',
  ssl: { rejectUnauthorized: false },
})
;(async () => {
  await c.connect()
  // Check whether Lan (a buddy) has a row in tourists
  const r = await c.query("SELECT id FROM public.tourists WHERE id = $1", ['11111111-1111-1111-1111-111111111111'])
  console.log('Lan in tourists?', r.rows.length > 0)
  // Check whether John has row in tourists
  const r2 = await c.query("SELECT id FROM public.tourists WHERE id = $1", ['aaaa1111-1111-1111-1111-111111111111'])
  console.log('John in tourists?', r2.rows.length > 0)
  // Check buddies
  const r3 = await c.query("SELECT id FROM public.buddies WHERE id = $1", ['11111111-1111-1111-1111-111111111111'])
  console.log('Lan in buddies?', r3.rows.length > 0)
  const r4 = await c.query("SELECT id FROM public.buddies WHERE id = $1", ['aaaa1111-1111-1111-1111-111111111111'])
  console.log('John in buddies?', r4.rows.length > 0)
  await c.end()
})()