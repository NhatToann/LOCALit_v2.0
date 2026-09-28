// scripts/diag-messages-full.mjs
// Full dump of messages table: column types, constraints, triggers,
// and full policy definition source (via pg_get_policydef).
import pg from 'pg'
const { Client } = pg

const url = process.env.SUPABASE_URL
const pw = process.env.SUPABASE_DB_PASSWORD
if (!url || !pw) { console.error('Set env.'); process.exit(1) }
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
const host = `${new URL(url).hostname.split('.')[0]}.supabase.co`
const c = new Client({
  connectionString: `postgresql://postgres:${pw}@db.${host}:5432/postgres`,
  ssl: { rejectUnauthorized: false },
})
await c.connect()
try {
  const cols = await c.query(`
    SELECT column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_schema='public' AND table_name='messages'
    ORDER BY ordinal_position
  `)
  console.log('columns:')
  for (const r of cols.rows)
    console.log(`  ${r.column_name.padEnd(28)} ${r.data_type}${r.is_nullable==='NO'?' NOT NULL':''}  default=${r.column_default ?? '-'}`)

  const tg = await c.query(`
    SELECT tgname, tgrelid::regclass AS table, tgenabled,
           pg_get_triggerdef(oid) AS def
    FROM pg_trigger
    WHERE tgrelid='public.messages'::regclass AND NOT tgisinternal
    ORDER BY tgname
  `)
  console.log('\ntriggers:')
  for (const r of tg.rows) console.log(`  ${r.tgname} (${r.tgenabled})\n    ${r.def}`)

  const pol = await c.query(`
    SELECT polname AS policyname,
           CASE polcmd WHEN 'r' THEN 'SELECT' WHEN 'a' THEN 'INSERT' WHEN 'w' THEN 'UPDATE' WHEN 'd' THEN 'DELETE' ELSE polcmd::text END AS cmd,
           pg_get_expr(polqual, c.oid) AS using_expr,
           pg_get_expr(polwithcheck, c.oid) AS with_check_expr
    FROM pg_policy p
    JOIN pg_class c ON c.oid = p.polrelid
    WHERE c.relname = 'messages' AND c.relnamespace = 'public'::regnamespace
    ORDER BY polcmd, polname
  `)
  console.log('\nfull policy expressions:')
  for (const r of pol.rows) {
    console.log(`\n  [${r.cmd}] ${r.policyname}`)
    if (r.using_expr) console.log(`    USING   = ${r.using_expr}`)
    if (r.with_check_expr) console.log(`    CHECK   = ${r.with_check_expr}`)
  }
} finally { await c.end() }
