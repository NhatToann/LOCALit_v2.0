import { Client } from 'pg'
const HOST = 'db.pqvnjgyqbxlylawwogjv.supabase.co'
const PORT = 5432
const DB_USER = 'postgres'
const DB_NAME = 'postgres'
const DB_PW = process.env.DB_PW || 'that1arlecchino'
;(async () => {
  const pg = new Client({ host: HOST, port: PORT, user: DB_USER, password: DB_PW, database: DB_NAME, ssl: { rejectUnauthorized: false } })
  await pg.connect()
  // Test direct insert as the service role would (postgres user mimics it)
  // Find sophie's id
  const r = await pg.query(`SELECT id FROM auth.users WHERE email = 'sophie.bennett.signup@localit-test.dev'`)
  const sophieId = r.rows[0]?.id
  if (!sophieId) {
    console.log('no sophie found')
    await pg.end()
    return
  }
  console.log('sophie id:', sophieId)
  // Insert profiles first (postgres role bypasses RLS)
  await pg.query(`INSERT INTO public.profiles (id, email, full_name, role) VALUES ($1, $2, 'Sophie Bennett', 'tourist') ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, full_name = EXCLUDED.full_name`, [sophieId, 'sophie.bennett.signup@localit-test.dev'])
  console.log('profile inserted')
  // Insert tourists
  try {
    await pg.query(`INSERT INTO public.tourists (id, nationality, travel_style, interests, languages, budget_range, destination, is_visible) VALUES ($1, 'United Kingdom', 'solo', ARRAY['history','beach'], ARRAY['English'], '50-100', 'Da Nang', true) ON CONFLICT (id) DO UPDATE SET interests = EXCLUDED.interests`, [sophieId])
    console.log('tourist inserted')
  } catch (e) {
    console.log('tourist insert FAILED:', e.message)
  }
  // Cleanup
  await pg.query(`DELETE FROM public.tourists WHERE id = $1`, [sophieId])
  await pg.query(`DELETE FROM public.profiles WHERE id = $1`, [sophieId])
  await pg.end()
})()
