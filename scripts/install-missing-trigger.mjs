#!/usr/bin/env node
// scripts/install-missing-trigger.mjs — repair the on_auth_user_created trigger.
// The trigger function (handle_new_user) is still defined in the live DB, but
// the trigger that binds it to auth.users is missing. This script recreates
// the binding. Safe to run multiple times (idempotent).
//
// Why this matters: without this trigger, every fresh sign-up creates a row
// in auth.users but NOT in public.profiles, which then breaks the FK from
// tourists/buddies -> profiles. /api/auth/create-profile has a defensive
// fallback, but the proper fix is the trigger.
import { Client } from 'pg'

const HOST = 'db.pqvnjgyqbxlylawwogjv.supabase.co'
const PORT = 5432
const DB_USER = 'postgres'
const DB_NAME = 'postgres'
const DB_PW = process.env.DB_PW || process.env.SUPABASE_DB_PASSWORD || 'that1arlecchino'

const pg = new Client({ host: HOST, port: PORT, user: DB_USER, password: DB_PW, database: DB_NAME, ssl: { rejectUnauthorized: false } })

async function main() {
  await pg.connect()
  console.log('[trigger] Dropping any stale binding on auth.users...')
  await pg.query('DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users')

  console.log('[trigger] Recreating trigger that calls public.handle_new_user()...')
  await pg.query(`
    CREATE TRIGGER on_auth_user_created
      AFTER INSERT ON auth.users
      FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
  `)
  console.log('[trigger] OK.')

  console.log('[trigger] Verifying:')
  const r = await pg.query("SELECT tgname, tgenabled FROM pg_trigger WHERE tgrelid='auth.users'::regclass AND NOT tgisinternal")
  console.log('  auth.users triggers:', JSON.stringify(r.rows))

  await pg.end()
}

main().catch(e => { console.error('Failed:', e.message); process.exit(1) })
