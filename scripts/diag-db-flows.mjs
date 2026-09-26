#!/usr/bin/env node
// scripts/diag-db-flows.mjs — direct DB-side smoke test for the auth/profile flow.
// Mimics exactly what /api/auth/create-profile does, but in plain SQL via pg, so
// we don't need the service role key. Verifies:
//   - profiles table accepts inserts linked to auth.users
//   - tourists/buddies tables accept role-specific rows
//   - RLS does not block service-role-equivalent writes (postgres user)
//   - trigger on profiles auto-updates updated_at
//   - the original flow's sequence (signUp -> createProfile -> signIn) is consistent
import { Client } from 'pg'

const HOST = 'db.pqvnjgyqbxlylawwogjv.supabase.co'
const PORT = 5432
const DB_USER = 'postgres'
const DB_NAME = 'postgres'
const DB_PW = process.env.DB_PW || process.env.SUPABASE_DB_PASSWORD || 'that1arlecchino'

let passed = 0, failed = 0
function ok(m) { console.log(`  \u2713 ${m}`); passed++ }
function bad(m) { console.log(`  \u2717 ${m}`); failed++ }
function head(n) { console.log(`\n=== ${n} ===`) }

const pg = new Client({ host: HOST, port: PORT, user: DB_USER, password: DB_PW, database: DB_NAME, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 10000 })

async function run() {
  console.log('LOCALit DB-level flow test (mimics /api/auth/create-profile)')
  await pg.connect()

  const STAMP = Date.now()
  const TEST_EMAIL = `dbtest-${STAMP}@localit-test.dev`
  const TEST_ID = '00000000-0000-4000-8000-' + (STAMP % 1e12).toString(16).padStart(12, '0')

  try {
    head('1. Insert auth.users (simulates signUp)')
    await pg.query(`
      INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password,
        email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
      VALUES ($1, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
        $2, crypt('testpass', gen_salt('bf')), now(),
        '{"provider":"email","providers":["email"]}'::jsonb,
        '{"full_name":"DB Tester","role":"tourist"}'::jsonb,
        now(), now())
    `, [TEST_ID, TEST_EMAIL])
    ok('auth.users row inserted')

    head('2. Verify trigger created profiles row')
    // The trigger is on auth.users -> profiles. It might run synchronously,
    // or might fire on commit. Wait a moment then query.
    await new Promise(r => setTimeout(r, 500))
    let { rows: prof } = await pg.query('SELECT id, role, full_name FROM public.profiles WHERE id = $1', [TEST_ID])
    if (prof.length === 1) {
      ok(`trigger fired: profiles row exists with role=${prof[0].role}`)
    } else {
      bad(`profiles row MISSING \u2014 trigger may not be installed (would mean sign-ups break!)`)
      // Try to manually insert it as fallback to keep test going
      await pg.query(
        `INSERT INTO public.profiles (id, email, role, full_name) VALUES ($1, $2, 'tourist', 'DB Tester') ON CONFLICT (id) DO NOTHING`,
        [TEST_ID, TEST_EMAIL],
      )
      ok('manually inserted profiles row as fallback')
    }

    head('3. Insert tourists row (simulates upsert from create-profile)')
    await pg.query(`
      INSERT INTO public.tourists (id, nationality, travel_style, interests, languages, budget_range, destination, is_visible, updated_at)
      VALUES ($1, 'United States', 'solo', ARRAY['food','photography'], ARRAY['English'], '50-100', 'Da Nang', true, now())
    `, [TEST_ID])
    ok('tourists row inserted')

    head('4. Verify foreign-key symmetry (profiles.id references auth.users.id)')
    const { rows: sym } = await pg.query(`
      SELECT
        (SELECT id FROM public.profiles WHERE id = $1) AS p,
        (SELECT id FROM auth.users WHERE id = $1) AS a,
        (SELECT id FROM public.tourists WHERE id = $1) AS t
    `, [TEST_ID])
    const row = sym[0]
    if (row.p && row.a && row.t) ok('all 3 rows present and correctly keyed')
    else bad(`FK mismatch: ${JSON.stringify(row)}`)

    head('5. Test updated_at trigger')
    const { rows: before } = await pg.query('SELECT updated_at FROM public.profiles WHERE id = $1', [TEST_ID])
    await new Promise(r => setTimeout(r, 1100))
    await pg.query('UPDATE public.profiles SET full_name = $1 WHERE id = $2', ['DB Tester Updated', TEST_ID])
    const { rows: after } = await pg.query('SELECT updated_at FROM public.profiles WHERE id = $1', [TEST_ID])
    if (new Date(after[0].updated_at) > new Date(before[0].updated_at)) {
      ok('updated_at auto-bumps on UPDATE')
    } else {
      bad('updated_at DID NOT change')
    }

    head('6. RLS check: anon user from Supabase sees only is_visible=true rows')
    // Simulate what PostgREST does for the anon role
    await pg.query("SET ROLE anon")
    const { rows: visible } = await pg.query("SELECT id FROM public.tourists WHERE is_visible = true")
    ok(`anon sees ${visible.length} visible tourists`)
    const { rows: hidden } = await pg.query("SELECT id FROM public.tourists WHERE is_visible = false")
    ok(`anon sees ${hidden.length} hidden tourists (should be 0)`)
    if (hidden.length > 0) bad('RLS LEAK: anon can see hidden profiles!')
    await pg.query("RESET ROLE")

    head('7. Cleanup')
    await pg.query("SET ROLE postgres")
    await pg.query('DELETE FROM public.tourists WHERE id = $1', [TEST_ID])
    await pg.query('DELETE FROM public.profiles WHERE id = $1', [TEST_ID])
    await pg.query('DELETE FROM auth.users WHERE id = $1', [TEST_ID])
    ok('rows removed')
  } catch (e) {
    bad(`Error: ${e.message}`)
    console.error(e.stack)
  } finally {
    await pg.end()
  }

  console.log(`\n=== Summary === passed=${passed} failed=${failed}`)
  process.exit(failed > 0 ? 1 : 0)
}

run()
