import { Client } from 'pg'

const c = new Client({
  connectionString: 'postgresql://postgres:that1arlecchino@db.pqvnjgyqbxlylawwogjv.supabase.co:5432/postgres',
  ssl: { rejectUnauthorized: false },
})

await c.connect()

// Which grants does `authenticated` have on profiles.avatar_url?
const g = await c.query(`
  SELECT grantee, privilege_type
  FROM information_schema.column_privileges
  WHERE table_schema='public' AND table_name='profiles'
    AND column_name='avatar_url'
`)
console.log('--- avatar_url grants ---')
console.log(g.rows.map(r => `${r.grantee}:${r.privilege_type}`).join('  '))

// Which grants on profiles.email (the PII column)?
const ge = await c.query(`
  SELECT grantee, privilege_type
  FROM information_schema.column_privileges
  WHERE table_schema='public' AND table_name='profiles'
    AND column_name='email'
`)
console.log('--- email grants ---')
console.log(ge.rows.map(r => `${r.grantee}:${r.privilege_type}`).join('  ') || '(none)')

// Table-level grants (these OVERRIDE column-level in Postgres)
const tg = await c.query(`
  SELECT grantee, privilege_type
  FROM information_schema.table_privileges
  WHERE table_schema='public' AND table_name='profiles'
  ORDER BY grantee, privilege_type
`)
console.log('--- table-level grants ---')
console.log(tg.rows.map(r => `${r.grantee}:${r.privilege_type}`).join('  '))

const pol = await c.query(`
  SELECT policyname, cmd, roles::text AS roles, qual
  FROM pg_policies WHERE schemaname='public' AND tablename='profiles'
`)
console.log('--- profiles RLS policies ---')
for (const p of pol.rows) console.log(`${p.policyname} [${p.cmd}] roles=${p.roles} qual=${p.qual}`)

const rl = await c.query(`
  SELECT relrowsecurity, relforcerowsecurity FROM pg_class
  WHERE relname='profiles' AND relnamespace='public'::regnamespace
`)
console.log('--- RLS flags ---', JSON.stringify(rl.rows[0]))

const rows = await c.query(`
  SELECT p.email, p.full_name, p.role, coalesce(p.avatar_url,'(null)') AS avatar
  FROM public.profiles p
  WHERE p.email IN ('lan.pham@localit.dev','john.doe@example.com')
`)
console.log('--- seed rows ---')
for (const r of rows.rows) console.log(`${r.email} | ${r.full_name} | ${r.role} | ${r.avatar}`)

await c.end()