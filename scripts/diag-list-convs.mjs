// scripts/diag-list-convs.mjs
import { Client } from 'pg'
const c = new Client({
  connectionString:
    'postgresql://postgres:that1arlecchino@db.pqvnjgyqbxlylawwogjv.supabase.co:5432/postgres',
  ssl: { rejectUnauthorized: false },
})
await c.connect()
const u = await c.query("SELECT id, email, raw_user_meta_data->>'full_name' AS name FROM auth.users WHERE email IN ('john.doe@example.com','lan.pham@localit.dev')")
console.log('users:', u.rows)
const v = await c.query("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='conversations' ORDER BY ordinal_position")
console.log('conv cols:', v.rows.map(r => r.column_name))
await c.end()
