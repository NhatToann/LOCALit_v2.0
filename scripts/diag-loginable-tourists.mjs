import pg from 'pg'
const { Client } = pg
const c = new Client({
  connectionString: `postgresql://postgres:${process.env.DB_PW}@db.pqvnjgyqbxlylawwogjv.supabase.co:5432/postgres`,
  ssl: { rejectUnauthorized: false },
})
await c.connect()
const r = await c.query(`
  SELECT p.id, p.email, p.role,
         au.encrypted_password IS NOT NULL AS has_password
  FROM public.profiles p
  JOIN auth.users au ON au.id = p.id
  WHERE p.role = 'tourist' AND au.encrypted_password IS NOT NULL
  ORDER BY p.email
`)
console.log('Tourists with passwords:')
for (const row of r.rows) {
  const validUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(row.id)
  console.log(' ', row.email, row.id, validUuid ? '(valid uuid)' : '(FAKE UUID)')
}
await c.end()
