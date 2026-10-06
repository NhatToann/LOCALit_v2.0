import { Client } from 'pg'

const c = new Client({
  connectionString: `postgresql://postgres:${process.env.DB_PW}@db.pqvnjgyqbxlylawwogjv.supabase.co:5432/postgres`,
  ssl: { rejectUnauthorized: false },
})
await c.connect()

// 1. Get all public tables + row counts
const tables = await c.query(`
  SELECT
    t.tablename,
    COALESCE(s.n_live_tup, 0)::int AS row_count,
    t.rowsecurity AS rls_enabled
  FROM pg_tables t
  LEFT JOIN pg_stat_user_tables s
    ON s.schemaname = 'public' AND s.relname = t.tablename
  WHERE t.schemaname = 'public'
  ORDER BY t.tablename
`)

// 2. Get service_role grants per table
const grants = await c.query(`
  SELECT table_name, string_agg(privilege_type, ',' ORDER BY privilege_type) AS privs
  FROM information_schema.table_privileges
  WHERE table_schema='public' AND grantee='service_role'
  GROUP BY table_name
`)
const grantMap = Object.fromEntries(grants.rows.map((g) => [g.table_name, g.privs]))

// 3. Get all triggers on public tables
const triggers = await c.query(`
  SELECT tgrelid::regclass::text AS table_name, tgname
  FROM pg_trigger
  WHERE NOT tgisinternal AND tgrelid::regclass::text LIKE 'public.%'
  ORDER BY table_name, tgname
`)
const triggerMap = {}
for (const t of triggers.rows) {
  triggerMap[t.table_name] ??= []
  triggerMap[t.table_name].push(t.tgname)
}

// 4. Verdict logic
const verdict = (rows, hasRefs, hasTriggers) => {
  if (rows === 0 && !hasRefs && !hasTriggers) return 'DROP_CANDIDATE'
  if (rows === 0 && !hasRefs && hasTriggers) return 'INVESTIGATE (has triggers, 0 refs)'
  if (rows === 0 && hasRefs) return 'KEEP (0 rows but code uses it)'
  return 'KEEP'
}

// Static "code references" — derived from manual grep knowledge (we'll re-grep in code review)
// For audit purposes, we mark 0-row tables as candidates; the user will manually verify.
const audit = tables.rows.map((t) => ({
  table: t.tablename,
  rows: t.row_count,
  rls: t.rls_enabled ? 'enabled' : 'DISABLED!',
  service_role_grants: grantMap[t.tablename] ?? 'NONE',
  triggers: triggerMap[`public.${t.tablename}`] ?? [],
  verdict: t.row_count === 0 ? 'INVESTIGATE (0 rows)' : 'KEEP (has data)',
}))

// Sort: candidates first
audit.sort((a, b) => {
  if (a.verdict.startsWith('DROP_CANDIDATE')) return -1
  if (b.verdict.startsWith('DROP_CANDIDATE')) return 1
  if (a.verdict.startsWith('INVESTIGATE') && !b.verdict.startsWith('INVESTIGATE')) return -1
  if (b.verdict.startsWith('INVESTIGATE') && !a.verdict.startsWith('INVESTIGATE')) return 1
  return a.table.localeCompare(b.table)
})

console.log(JSON.stringify(audit, null, 2))
await c.end()
