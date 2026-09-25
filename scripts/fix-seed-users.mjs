#!/usr/bin/env node
/**
 * LOCALit: fix the 9 demo users created by supabase/seed.sql so they can
 * actually sign in.
 *
 * The seed.sql INSERT statement omits several NOT-NULL columns that GoTrue
 * requires (aud, role, instance_id, raw_app_meta_data, email_confirmed_at,
 * confirmation_token). This script backfills them, then refreshes the password
 * hash to a known value so password-based sign-in succeeds.
 *
 * Usage:
 *   DB_PW=... node scripts/fix-seed-users.mjs
 */
import { Client } from 'pg'

const HOST = 'db.pqvnjgyqbxlylawwogjv.supabase.co'
const PORT = 5432
const DB_USER = 'postgres'
const DB_NAME = 'postgres'

const DEMO_PASSWORD = 'password123'

const DEMO_USERS = [
  { id: '11111111-1111-1111-1111-111111111111', email: 'lan.pham@localit.dev',    full_name: 'Lan Pham',    role: 'buddy' },
  { id: '22222222-2222-2222-2222-222222222222', email: 'minh.nguyen@localit.dev', full_name: 'Minh Nguyen', role: 'buddy' },
  { id: '33333333-3333-3333-3333-333333333333', email: 'huy.nguyen@localit.dev',  full_name: 'Huy Nguyen',  role: 'buddy' },
  { id: '44444444-4444-4444-4444-444444444444', email: 'linh.tran@localit.dev',   full_name: 'Linh Tran',   role: 'buddy' },
  { id: '55555555-5555-5555-5555-555555555555', email: 'mai.le@localit.dev',      full_name: 'Mai Le',      role: 'buddy' },
  { id: '66666666-6666-6666-6666-666666666666', email: 'tuan.vu@localit.dev',     full_name: 'Tuan Vu',     role: 'buddy' },
  { id: 'aaaa1111-1111-1111-1111-111111111111', email: 'john.doe@example.com',    full_name: 'John Doe',    role: 'tourist' },
  { id: 'aaaa2222-2222-2222-2222-222222222222', email: 'sarah.m@example.com',    full_name: 'Sarah Miller', role: 'tourist' },
  { id: 'aaaa3333-3333-3333-3333-333333333333', email: 'mike.j@example.com',     full_name: 'Mike Johnson', role: 'tourist' },
]

function getPassword() {
  return process.env.DB_PW || process.env.SUPABASE_DB_PASSWORD
}

async function main() {
  const pw = getPassword()
  if (!pw) throw new Error('Set DB_PW env var')
  const pg = new Client({ host: HOST, port: PORT, user: DB_USER, password: pw, database: DB_NAME, ssl: { rejectUnauthorized: false } })
  await pg.connect()

  console.log(`[fix-seed-users] Backfilling ${DEMO_USERS.length} demo auth users…`)
  let touched = 0
  for (const u of DEMO_USERS) {
    const r = await pg.query(
      `UPDATE auth.users
         SET aud = COALESCE(aud, 'authenticated'),
             role = COALESCE(role, 'authenticated'),
             instance_id = COALESCE(instance_id, '00000000-0000-0000-0000-000000000000'::uuid),
             encrypted_password = crypt($2, gen_salt('bf')),
             email_confirmed_at = COALESCE(email_confirmed_at, now()),
             confirmation_token = COALESCE(confirmation_token, ''),
             email_change = COALESCE(email_change, ''),
             email_change_token_new = COALESCE(email_change_token_new, ''),
             email_change_token_current = COALESCE(email_change_token_current, ''),
             recovery_token = COALESCE(recovery_token, ''),
             reauthentication_token = COALESCE(reauthentication_token, ''),
             phone_change = COALESCE(phone_change, ''),
             phone_change_token = COALESCE(phone_change_token, ''),
             raw_app_meta_data = COALESCE(raw_app_meta_data, '{"provider":"email","providers":["email"]}'::jsonb),
             created_at = COALESCE(created_at, now()),
             is_anonymous = COALESCE(is_anonymous, false),
             is_sso_user = COALESCE(is_sso_user, false),
             email_change_confirm_status = COALESCE(email_change_confirm_status, 0),
             updated_at = now()
       WHERE id = $1::uuid
       RETURNING email, email_confirmed_at IS NOT NULL AS confirmed, aud, role`,
      [u.id, DEMO_PASSWORD],
    )
    if (r.rows.length === 0) {
      console.log(`  ! ${u.email}  (no row with id ${u.id} — run seed.sql first)`)
      continue
    }
    const row = r.rows[0]
    console.log(`  ✓ ${row.email.padEnd(32)} confirmed=${row.confirmed} aud=${row.aud} role=${row.role}`)

    // Ensure an auth.identities row exists (GoTrue requires this for sign-in)
    await pg.query(
      `INSERT INTO auth.identities (
         id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
       ) VALUES (
         gen_random_uuid(),
         $1::uuid,
         jsonb_build_object('sub', $1::text, 'email', $2::text, 'email_verified', true, 'phone_verified', false),
         'email',
         $2::text,
         now(),
         now(),
         now()
       )
       ON CONFLICT (provider, provider_id) DO UPDATE
         SET last_sign_in_at = now(), updated_at = now()`,
      [u.id, u.email],
    )
    touched++
  }

  console.log(`\n[fix-seed-users] ${touched}/${DEMO_USERS.length} rows updated.`)
  console.log(`Try signing in with: lan.pham@localit.dev / ${DEMO_PASSWORD} (buddy)`)
  await pg.end()
}

main().catch((e) => {
  console.error('[fix-seed-users] failed:', e.message)
  process.exit(1)
})
