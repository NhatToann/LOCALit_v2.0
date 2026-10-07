import { Client } from 'pg'
const c = new Client({
  connectionString: 'postgresql://postgres:that1arlecchino@db.pqvnjgyqbxlylawwogjv.supabase.co:5432/postgres',
  ssl: { rejectUnauthorized: false },
})
await c.connect()
// Use the same all-zeros UUID that we set on auth.users.instance_id.
const uuid = '00000000-0000-0000-0000-000000000000'
await c.query(
  `INSERT INTO auth.instances (id, uuid, raw_base_config, created_at, updated_at)
   VALUES ($1, $1, '{}'::jsonb, NOW(), NOW())
   ON CONFLICT (id) DO NOTHING`,
  [uuid],
)
console.log('inserted instance:', uuid)
const { rows } = await c.query(`SELECT * FROM auth.instances`)
console.log(JSON.stringify(rows, null, 2))
await c.end()