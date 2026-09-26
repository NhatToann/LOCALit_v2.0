import { Client } from 'pg'
const c = new Client({
  host: 'db.pqvnjgyqbxlylawwogjv.supabase.co',
  port: 5432,
  user: 'postgres',
  password: 'that1arlecchino',
  database: 'postgres',
  ssl: { rejectUnauthorized: false },
})
async function main() {
  await c.connect()
  // Reset John's corrupted full_name back to "John Doe" (the original seed).
  const r = await c.query(
    `UPDATE public.profiles
     SET full_name = 'John Doe'
     WHERE email = 'john.doe@example.com'
       AND full_name LIKE '%undefined%'
     RETURNING id, full_name, email`,
  )
  console.log('Cleaned up profiles:', JSON.stringify(r.rows, null, 2))

  // Same belt-and-suspenders for any other profile with literal "undefined" in name.
  const orphans = await c.query(
    `SELECT id, full_name, email FROM public.profiles
     WHERE full_name ~ '(^|\\s)undefined($|\\s)'
        OR full_name = 'undefined'`,
  )
  console.log('Any other "undefined"-tainted profiles:', orphans.rows)
  await c.end()
}
main().catch(e => { console.error(e); process.exit(1) })
