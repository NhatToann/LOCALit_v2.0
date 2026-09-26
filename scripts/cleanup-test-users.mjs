// Clean up the test users I created during red team verification.
import { Client } from 'pg'
const c = new Client({
  host: 'db.pqvnjgyqbxlylawwogjv.supabase.co',
  port: 5432,
  user: 'postgres',
  password: 'that1arlecchino',
  database: 'postgres',
  ssl: { rejectUnauthorized: false },
})

const testEmails = [
  'verify-idor-001@redteam.test',
  'verify-idor-002@redteam.test',
  'verify-final-001@redteam.test',
  'verify-after-deploy-fixed@test.local',
  'verify-after-deploy-v2@test.local',
  'verify-after-searchpath@test.local',
  'verify-final-fresh@test.local',
]

async function main() {
  await c.connect()
  for (const email of testEmails) {
    const ids = await c.query('SELECT id FROM auth.users WHERE email = $1', [email])
    if (ids.rowCount === 0) {
      console.log('skip', email, 'not found')
      continue
    }
    const userId = ids.rows[0].id
    // Remove dependents first (in case RLS via FK doesn't cascade)
    await c.query('DELETE FROM public.buddies WHERE id = $1', [userId])
    await c.query('DELETE FROM public.tourists WHERE id = $1', [userId])
    await c.query('DELETE FROM public.profiles WHERE id = $1', [userId])
    await c.query('DELETE FROM public.email_verifications WHERE user_id = $1', [userId])
    // auth.identities first (FK to auth.users)
    await c.query('DELETE FROM auth.identities WHERE user_id = $1', [userId])
    const r = await c.query('DELETE FROM auth.users WHERE id = $1', [userId])
    console.log('deleted', email, '→', r.rowCount, 'rows from auth.users')
  }
  await c.end()
}
main().catch(e => { console.error(e); process.exit(1) })
