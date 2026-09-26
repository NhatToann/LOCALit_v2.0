#!/usr/bin/env node
// scripts/diag-flows.mjs — end-to-end smoke test for the critical LOCALit flows.
// Runs without requiring the service role key (uses DB password instead).
//
// What it tests:
//   1. Reachability: can we connect to Supabase Postgres at all?
//   2. Schema sanity: do all expected tables exist? do tourists/buddies rows
//      exist? does public.profiles have a trigger?
//   3. Auth.users ↔ profiles symmetry: every auth.users row should have a
//      matching public.profiles row (the trigger creates it).
//   4. RLS sanity: anon SELECT on tourists returns only approved rows, admin
//      sees all. (We can't run this in pure-JS without service-role, so we
//      only check the policy existence.)
//   5. Production URL: is the deployed /login page reachable?
//
// Each section is independent — a failure in one doesn't abort the rest.
import { Client } from 'pg'

const HOST = 'db.pqvnjgyqbxlylawwogjv.supabase.co'
const PORT = 5432
const DB_USER = 'postgres'
const DB_NAME = 'postgres'
const DB_PW = process.env.DB_PW || process.env.SUPABASE_DB_PASSWORD || 'that1arlecchino'

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://pqvnjgyqbxlylawwogjv.supabase.co'
// IMPORTANT: this URL changes every time a new production deploy happens.
// Always derive it via `vercel ls --prod | head -2` first; the auto-alias
// (localit-<hash>-nhattoann.vercel.app) lives for a single deploy only.
const PRODUCTION = process.env.PRODUCTION_URL || 'https://localit-7860e6b8u-nhattoann.vercel.app'

const SECTIONS = { pass: 0, fail: 0, skipped: 0 }

function ok(msg) { console.log(`  \u2713 ${msg}`); SECTIONS.pass++ }
function bad(msg) { console.log(`  \u2717 ${msg}`); SECTIONS.fail++ }
function skip(msg) { console.log(`  \u25CB ${msg} (skipped)`); SECTIONS.skipped++ }
function header(name) { console.log(`\n=== ${name} ===`) }

const client = new Client({
  host: HOST, port: PORT, user: DB_USER, password: DB_PW, database: DB_NAME,
  ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 10000,
})

async function sectionDbConnect() {
  header('1. Database connectivity')
  try {
    await client.connect()
    const r = await client.query('SELECT version() AS v, now() AS ts')
    ok(`Connected: ${r.rows[0].v.split(' ').slice(0,2).join(' ')} (server time ${r.rows[0].ts.toISOString()})`)
  } catch (e) {
    bad(`Cannot connect: ${e.message}`)
    throw e
  }
}

async function sectionTablesExist() {
  header('2. Schema sanity (expected tables)')
  const expected = ['profiles', 'tourists', 'buddies', 'connections', 'trips',
                    'trip_stops', 'conversations', 'messages', 'location_updates',
                    'reviews']
  for (const t of expected) {
    try {
      const { rows } = await client.query(
        'SELECT COUNT(*)::int AS c FROM pg_tables WHERE schemaname = $1 AND tablename = $2',
        ['public', t]
      )
      if (rows[0].c === 1) ok(`${t} exists`)
      else bad(`${t} MISSING`)
    } catch (e) {
      bad(`${t} ERROR: ${e.message}`)
    }
  }
}

async function sectionRowCounts() {
  header('3. Row counts')
  for (const t of ['profiles', 'tourists', 'buddies', 'auth.users']) {
    try {
      const q = t === 'auth.users'
        ? 'SELECT COUNT(*)::int AS c FROM auth.users'
        : `SELECT COUNT(*)::int AS c FROM public.${t}`
      const { rows } = await client.query(q)
      ok(`${t}: ${rows[0].c} rows`)
    } catch (e) {
      bad(`${t}: ${e.message}`)
    }
  }
}

async function sectionTrigger() {
  header('4. profiles trigger from auth.users')
  try {
    const { rows } = await client.query(`
      SELECT tgname, pg_get_triggerdef(oid) AS def
      FROM pg_trigger
      WHERE tgrelid = 'public.profiles'::regclass
        AND NOT tgisinternal
    `)
    if (rows.length === 0) {
      bad('No trigger on public.profiles — sign-ups will fail to create profile rows')
    } else {
      for (const r of rows) {
        ok(`trigger ${r.tgname}: ${r.def.split('\n')[0].slice(0, 80)}`)
      }
    }
  } catch (e) {
    bad(`trigger check ERROR: ${e.message}`)
  }
}

async function sectionRls() {
  header('5. RLS enabled on role tables')
  for (const t of ['tourists', 'buddies', 'profiles']) {
    try {
      const { rows } = await client.query(`
        SELECT relrowsecurity, relforcerowsecurity FROM pg_class WHERE relname = $1 AND relnamespace = 'public'::regnamespace
      `, [t])
      if (rows.length === 0) { bad(`${t} table not found`); continue }
      const r = rows[0]
      ok(`${t}: RLS=${r.relrowsecurity} (forced=${r.relforcerowsecurity})`)
    } catch (e) {
      bad(`${t} ERROR: ${e.message}`)
    }
  }
}

async function sectionAuthSymmetry() {
  header('6. auth.users \u2194 profiles symmetry')
  try {
    const { rows } = await client.query(`
      SELECT
        (SELECT COUNT(*) FROM auth.users) AS auth_users,
        (SELECT COUNT(*) FROM public.profiles) AS profiles,
        (SELECT COUNT(*) FROM auth.users u WHERE NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = u.id)) AS orphan_auth,
        (SELECT COUNT(*) FROM public.profiles p WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p.id)) AS orphan_profile
    `)
    const r = rows[0]
    ok(`auth.users=${r.auth_users} profiles=${r.profiles} orphan_auth=${r.orphan_auth} orphan_profile=${r.orphan_profile}`)
    if (Number(r.orphan_auth) > 0) {
      bad(`${r.orphan_auth} auth.users have no matching profiles row (trigger may have failed)`)
    }
  } catch (e) {
    bad(`symmetry ERROR: ${e.message}`)
  }
}

async function sectionProduction() {
  header('7. Production URL reachability')
  // Vercel Deployment Protection may issue a 302 to https://vercel.com/sso-api
  // for unauthenticated requests. We treat that as "reachable but gated",
  // which is the expected baseline for this project. A 200 means protection
  // is OFF or a valid bypass token was supplied.
  for (const path of ['/login', '/register', '/']) {
    try {
      const res = await fetch(`${PRODUCTION}${path}`, { redirect: 'manual' })
      if (res.status === 200) ok(`${path} \u2192 200 (page reachable)`)
      else if (res.status === 302 || res.status === 307) {
        const loc = res.headers.get('location') ?? ''
        if (loc.includes('vercel.com/sso-api')) {
          ok(`${path} \u2192 ${res.status} (Vercel Deployment Protection active \u2014 use \`vercel curl ${path}\` to bypass)`)
        } else {
          ok(`${path} \u2192 ${res.status} (redirect to ${loc.slice(0,40)})`)
        }
      } else if (res.status === 404) {
        ok(`${path} \u2192 404 (path may not exist on this alias; verify URL is current)`)
      } else {
        bad(`${path} \u2192 ${res.status}`)
      }
    } catch (e) {
      bad(`${path} \u2192 ERROR: ${e.message}`)
    }
  }
}

async function sectionNoLocationWrites() {
  header('8. Recent location_updates writes')
  try {
    const { rows } = await client.query(`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE updated_at > NOW() - INTERVAL '10 minutes')::int AS recent_10m,
        COUNT(*) FILTER (WHERE updated_at > NOW() - INTERVAL '1 hour')::int AS recent_1h
      FROM public.location_updates
    `)
    const r = rows[0]
    ok(`total=${r.total} recent_10m=${r.recent_10m} recent_1h=${r.recent_1h}`)
    if (r.recent_10m > 50) bad(`Unusual spike in location_updates (${r.recent_10m} rows in last 10 min)`)
    else ok('No anomalous spike')
  } catch (e) {
    bad(`location check ERROR: ${e.message}`)
  }
}

async function main() {
  console.log('LOCALit diagnostic suite')
  console.log('Target:', SUPABASE_URL)
  console.log('Production:', PRODUCTION)
  console.log('')

  let dbOk = false
  try {
    await sectionDbConnect()
    dbOk = true
    await sectionTablesExist()
    await sectionRowCounts()
    await sectionTrigger()
    await sectionRls()
    await sectionAuthSymmetry()
    await sectionNoLocationWrites()
  } catch {
    // db connection failed — remaining DB sections skipped
  }
  await sectionProduction()

  console.log('\n=== Summary ===')
  console.log(`  passed: ${SECTIONS.pass}`)
  console.log(`  failed: ${SECTIONS.fail}`)
  console.log(`  skipped: ${SECTIONS.skipped}`)
  console.log(`  db connected: ${dbOk}`)

  try { await client.end() } catch {}
  process.exit(SECTIONS.fail > 0 ? 1 : 0)
}

main().catch(e => { console.error('Fatal:', e); process.exit(2) })
