import { Client } from 'pg'
const c = new Client({
  connectionString: 'postgresql://postgres:that1arlecchino@db.pqvnjgyqbxlylawwogjv.supabase.co:5432/postgres',
  ssl: { rejectUnauthorized: false },
})
await c.connect()
const r = await c.query("SELECT id FROM auth.users WHERE email LIKE 'flowtest%'")
for (const row of r.rows) {
  await c.query('DELETE FROM email_verifications WHERE user_id = $1', [row.id])
  await c.query('DELETE FROM auth.identities WHERE user_id = $1', [row.id])
  await c.query('DELETE FROM auth.users WHERE id = $1', [row.id])
  console.log('deleted', row.id)
}
await c.end()
