// Reset the entire public schema and re-apply schema+seed
// WARNING: This deletes ALL data in public schema
import { Client } from 'pg'

const client = new Client({
  connectionString: `postgresql://postgres:${process.env.DB_PW}@db.pqvnjgyqbxlylawwogjv.supabase.co:5432/postgres`,
  ssl: { rejectUnauthorized: false },
})

try {
  await client.connect()
  console.log('🧹 Dropping public schema...')
  await client.query('DROP SCHEMA public CASCADE')
  console.log('✅ Dropped')
  console.log('🏗️  Recreating public schema...')
  await client.query('CREATE SCHEMA public')
  await client.query('GRANT ALL ON SCHEMA public TO postgres')
  await client.query('GRANT ALL ON SCHEMA public TO public')
  console.log('✅ Recreated')
} catch (e) {
  console.error('❌', e.message)
  process.exitCode = 1
} finally {
  await client.end()
}
