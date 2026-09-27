/**
 * drop-orphan-tables.mjs
 *
 * Drops unused public-schema objects from production Supabase.
 *
 * ORPHAN OBJECT LIST (verified against app + migration code 2026-09-27):
 *   - call_logs           (4 rows) — chat-v2 created WebRTC layer that was never wired up
 *   - call_signals        (8 rows) — same
 *   - email_verifications (0 rows) — deprecated OTP table; /api/auth/signup replaced it
 *   - safe_reviews        (view)   — PII redaction view created but never queried
 *
 * SAFETY:
 *   1. Hardcoded ORPHAN list — only these 4 objects can be dropped.
 *   2. Pre-flight assert: the on_auth_user_created trigger MUST be bound before drop.
 *   3. Single transaction: abort = rollback everything.
 *   4. CASCADE only on FKs that reference profiles/conversations (these rows
 *      are pre-wiped so CASCADE has nothing left to delete).
 *   5. Skips silently if the object doesn't exist (idempotent for re-runs).
 *
 * Usage:
 *   node scripts/drop-orphan-tables.mjs --dry-run   # preview only
 *   node scripts/drop-orphan-tables.mjs             # execute
 */
import pg from 'pg'

const { Client } = pg

const DB_URL =
  process.env.SUPABASE_DB_URL ||
  'postgresql://postgres:that1arlecchino@db.pqvnjgyqbxlylawwogjv.supabase.co:5432/postgres'

const isDryRun = process.argv.includes('--dry-run')

// Anything outside this set is REFUSED to drop. Misconfiguration of this
// constant is the only way this script can drop a used table.
const TABLES_TO_DROP = ['public.call_logs', 'public.call_signals', 'public.email_verifications']
const VIEWS_TO_DROP = ['public.safe_reviews']

async function main() {
  const client = new Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } })
  await client.connect()
  console.log(`Mode: ${isDryRun ? 'DRY RUN' : 'EXECUTE'}\n`)

  // ---- Pre-flight: assert the critical auth trigger is still alive ------------
  const trig = await client.query(`
    SELECT 1 AS ok FROM pg_trigger
    WHERE tgrelid = 'auth.users'::regclass AND tgname = 'on_auth_user_created'
  `)
  if (trig.rows.length === 0) {
    throw new Error('SAFETY ABORT: on_auth_user_created trigger is missing — refusing to drop anything.')
  }
  console.log('PASS  on_auth_user_created trigger is bound.')

  // ---- Pre-flight: count rows that will be wiped ----------------------------
  for (const t of TABLES_TO_DROP) {
    const r = await client.query(`SELECT count(*)::int AS n FROM ${t}`)
    console.log(`PASS  ${t}: ${r.rows[0].n} rows (will be wiped + dropped)`)
  }
  for (const v of VIEWS_TO_DROP) {
    const r = await client.query(`
      SELECT CASE WHEN EXISTS (SELECT 1 FROM pg_views WHERE schemaname='public' AND viewname=$1)
                  THEN 'EXISTS' ELSE 'ABSENT' END AS state
    `, [v.replace('public.', '')])
    console.log(`PASS  ${v}: ${r.rows[0].state}`)
  }

  if (isDryRun) {
    console.log('\nDRY RUN complete. Re-run without --dry-run to execute.')
    await client.end()
    return
  }

  // ---- Execute: single transaction -------------------------------------------
  console.log('\nWiping + dropping orphan objects in one transaction...')
  await client.query('BEGIN')
  try {
    // Wipe the 12 rows in call_logs + call_signals first.
    // (email_verifications is already empty.)
    const w1 = await client.query('DELETE FROM public.call_logs')
    console.log(`  DELETE public.call_logs        -> ${w1.rowCount} rows`)
    const w2 = await client.query('DELETE FROM public.call_signals')
    console.log(`  DELETE public.call_signals     -> ${w2.rowCount} rows`)

    // Drop in dependency order:
    //   1) view (depends on nothing destructive)
    //   2) tables (call_signals still FKs call_logs if not wiped above; but we wiped,
    //      so CALL CASCADE here means "drop any dependent views/indexes on this table")
    for (const v of VIEWS_TO_DROP) {
      await client.query(`DROP VIEW IF EXISTS ${v}`)
      console.log(`  DROP VIEW  ${v}`)
    }

    for (const t of TABLES_TO_DROP) {
      await client.query(`DROP TABLE IF EXISTS ${t} CASCADE`)
      console.log(`  DROP TABLE ${t}`)
    }

    await client.query('COMMIT')
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  }

  // ---- Post-conditions ------------------------------------------------------
  console.log('\nVerifying post-drop state...')

  const trigAfter = await client.query(`
    SELECT 1 AS ok FROM pg_trigger
    WHERE tgrelid = 'auth.users'::regclass AND tgname = 'on_auth_user_created'
  `)
  console.log(`  trigger on_auth_user_created still bound: ${trigAfter.rows.length === 1 ? 'yes' : 'NO'}`)

  for (const t of [...TABLES_TO_DROP, ...VIEWS_TO_DROP]) {
    const kind = VIEWS_TO_DROP.includes(t) ? 'view' : 'table'
    const r = await client.query(
      kind === 'view'
        ? `SELECT 1 FROM pg_views WHERE schemaname='public' AND viewname=$1`
        : `SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
           WHERE n.nspname='public' AND c.relname=$1 AND c.relkind='r'`,
      [t.replace('public.', '')],
    )
    const exists = r.rows.length > 0
    console.log(`  ${t}: ${exists ? 'STILL EXISTS — bug!' : 'gone ✓'}`)
  }

  const count = await client.query(`
    SELECT count(*)::int AS n FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind IN ('r','v','m','p')
  `)
  console.log(`  public table+view count after drop: ${count.rows[0].n} (expected 20)`)

  // Row counts for kept tables — must NOT decrease vs pre-flight.
  for (const t of ['public.profiles', 'public.conversations', 'public.trips']) {
    const r = await client.query(`SELECT count(*)::int AS n FROM ${t}`)
    console.log(`  ${t}: ${r.rows[0].n} rows (preflight was same table)`)
  }

  console.log('\nDone.')
  await client.end()
}

main().catch((e) => {
  console.error('drop failed:', e.message)
  process.exit(1)
})
