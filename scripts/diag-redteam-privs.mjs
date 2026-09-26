// Simulate an authenticated user reading their own profile + tourist row,
// including columns that anon cannot read (date_of_birth, bio).
import { Client } from 'pg'
const c = new Client({
  connectionString: `postgresql://postgres:${process.env.DB_PW}@db.pqvnjgyqbxlylawwogjv.supabase.co:5432/postgres`,
  ssl: { rejectUnauthorized: false },
})
await c.connect()

// SET LOCAL ROLE authenticated doesn't work via pg directly (auth.uid() needs JWT).
// Instead, verify by direct table read as superuser to confirm columns still exist
// and queries succeed when RLS is bypassed (service_role / owner).
const r1 = await c.query(`SELECT id, nationality, date_of_birth FROM public.tourists WHERE id='aaaa1111-1111-1111-1111-111111111111'`)
console.log('seed tourist DOB still readable by owner:', r1.rows)

// has_column_privilege takes (role, table.column, privilege)
const r2 = await c.query(`SELECT has_column_privilege('anon', 'public.tourists', 'date_of_birth', 'SELECT') AS can_read_dob`)
console.log('anon SELECT on date_of_birth?', r2.rows)
const r3 = await c.query(`SELECT has_column_privilege('anon', 'public.tourists', 'nationality', 'SELECT') AS can_read_nat`)
console.log('anon SELECT on nationality?', r3.rows)
const r4 = await c.query(`SELECT has_column_privilege('authenticated', 'public.tourists', 'date_of_birth', 'SELECT') AS can_read_dob`)
console.log('authenticated SELECT on date_of_birth?', r4.rows)
const r5 = await c.query(`SELECT has_column_privilege('authenticated', 'public.profiles', 'email', 'SELECT') AS can_read_email`)
console.log('authenticated SELECT on profiles.email?', r5.rows)
const r6 = await c.query(`SELECT has_column_privilege('anon', 'public.profiles', 'email', 'SELECT') AS can_read_email`)
console.log('anon SELECT on profiles.email?', r6.rows)
const r7 = await c.query(`SELECT has_column_privilege('anon', 'public.buddies', 'bio', 'SELECT') AS can_read_bio`)
console.log('anon SELECT on buddies.bio?', r7.rows)
await c.end()
