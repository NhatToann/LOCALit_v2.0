#!/usr/bin/env node
/**
 * Why does the fallback in app/buddies/[id]/page.tsx still 404?
 *
 * The page runs `createClient()` from utils/supabase/server, which uses
 * the ANON key plus any user cookie. For an anonymous visitor that is
 * `anon`. `public.profiles` has SELECT restricted to authenticated users
 * (the 2026-09-26 PII fix), so the fallback query returns nothing and we
 * call notFound().
 *
 * Confirms which of the two failure modes it is:
 *   - anon cannot see profiles at all          -> anon has 0 rows
 *   - anon can see profiles but not safe_buddies -> mismatch
 */
import { Client } from 'pg'

const SUPABASE = 'https://pqvnjgyqbxlylawwogjv.supabase.co'
const ANON = 'sb_publishable_3uRUZqdvazd4cENt8WOWJA_SB7HmCEE'
const JOHN = 'aaaa1111-1111-1111-1111-111111111111'

const restGet = async (table, query, label) => {
  const res = await fetch(`${SUPABASE}/rest/v1/${table}?${query}`, {
    headers: { apikey: ANON, Authorization: `Bearer ${ANON}` },
  })
  const body = await res.json().catch(() => null)
  const n = Array.isArray(body) ? body.length : 'err'
  console.log(`  ${label.padEnd(46)} ${res.status}  rows=${n}`)
  if (Array.isArray(body) && body.length) console.log(`      -> ${JSON.stringify(body[0]).slice(0, 160)}`)
  return { status: res.status, rows: Array.isArray(body) ? body.length : -1 }
}

console.log('=== ANON key visibility (what the public page actually has) ===\n')
await restGet('safe_buddies', `id=eq.${JOHN}&select=id,latitude`, 'safe_buddies (has GPS) -> expect 0')
await restGet('buddies', `id=eq.${JOHN}&select=id,latitude`, 'buddies table directly -> ?')
await restGet('profiles', `id=eq.${JOHN}&select=id,full_name,role`, 'profiles (anon) -> ?')
await restGet('safe_profiles', `id=eq.${JOHN}&select=id,full_name,role`, 'safe_profiles (anon) -> ?')

const pg = new Client({
  host: 'db.pqvnjgyqbxlylawwogjv.supabase.co',
  port: 5432,
  user: 'postgres',
  password: process.env.DB_PW || process.env.SUPABASE_DB_PASSWORD || 'that1arlecchino',
  database: 'postgres',
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 15000,
})
await pg.connect()
try {
  console.log('\n=== RLS POLICIES on the tables the fallback needs ===')
  const { rows } = await pg.query(
    `SELECT tablename, policyname, roles::text, cmd,
            (qual IS NULL) AS no_where_clause
     FROM pg_policies
     WHERE schemaname='public' AND tablename IN ('profiles','buddies','safe_buddies','safe_profiles')
     ORDER BY tablename, policyname`,
  )
  console.table(rows)

  console.log('\n=== COLUMN GRANTS on profiles for anon ===')
  const g = await pg.query(
    `SELECT privilege_type
     FROM information_schema.column_privileges
     WHERE table_schema='public' AND table_name='profiles' AND grantee='anon'
     ORDER BY privilege_type`,
  )
  console.log(`  anon column grants: ${g.rowCount} (0 = anon cannot read profiles at all)`)

  console.log('\n=== Does safe_buddies expose is_available=false buddies? ===')
  const v = await pg.query(
    `SELECT count(*) FILTER (WHERE is_available) AS available,
            count(*) FILTER (WHERE NOT is_available) AS not_available,
            count(*) AS total
     FROM public.buddies`,
  )
  console.log('  buddies table:', JSON.stringify(v.rows[0]))
  const v2 = await pg.query(`SELECT count(*) AS in_view FROM public.safe_buddies`)
  console.log('  safe_buddies view:', JSON.stringify(v2.rows[0]))
} catch (e) {
  console.error('FAILED:', e.message)
} finally {
  await pg.end()
}