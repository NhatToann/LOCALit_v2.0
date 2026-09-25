import { Client } from 'pg'

const client = new Client({
  connectionString: `postgresql://postgres:${process.env.DB_PW}@db.pqvnjgyqbxlylawwogjv.supabase.co:5432/postgres`,
  ssl: { rejectUnauthorized: false },
})

try {
  await client.connect()
  // Try insert into auth.users
  await client.query(`
    INSERT INTO auth.users (id, email) VALUES
      ('11111111-1111-1111-1111-111111111111', 'lan.pham@localit.dev')
  `)
  console.log('auth.users insert OK')
} catch (e) {
  console.log('ERR:', e.message)
  console.log('Code:', e.code)
  console.log('Detail:', e.detail)
  console.log('Hint:', e.hint)
} finally {
  await client.end()
}
