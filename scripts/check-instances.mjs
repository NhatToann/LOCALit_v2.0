import { Client } from 'pg'
const c = new Client({
  connectionString: 'postgresql://postgres:that1arlecchino@db.pqvnjgyqbxlylawwogjv.supabase.co:5432/postgres',
  ssl: { rejectUnauthorized: false },
})
await c.connect()
const { rows } = await c.query(`SELECT * FROM auth.instances`)
console.log('auth.instances:', JSON.stringify(rows, null, 2))
const { rows: cols } = await c.query(`
  SELECT column_name, is_nullable, column_default
  FROM information_schema.columns
  WHERE table_schema='auth' AND table_name='instances'`)
console.log('columns:', JSON.stringify(cols, null, 2))
await c.end()