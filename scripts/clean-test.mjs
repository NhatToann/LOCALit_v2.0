import { Client } from 'pg'

const client = new Client({
  connectionString: `postgresql://postgres:${process.env.DB_PW}@db.pqvnjgyqbxlylawwogjv.supabase.co:5432/postgres`,
  ssl: { rejectUnauthorized: false },
})

try {
  await client.connect()
  // Clean test inserts
  await client.query(`DELETE FROM public.profiles WHERE id = '11111111-1111-1111-1111-111111111111'`)
  await client.query(`DELETE FROM auth.users WHERE id = '11111111-1111-1111-1111-111111111111'`)
  console.log('✅ Cleaned test data')

  // Check current counts
  const { rows: profileCount } = await client.query('SELECT COUNT(*) FROM public.profiles')
  const { rows: authCount } = await client.query('SELECT COUNT(*) FROM auth.users')
  console.log('profiles:', profileCount[0].count, 'auth.users:', authCount[0].count)
} catch (e) {
  console.error('❌', e.message)
} finally {
  await client.end()
}
