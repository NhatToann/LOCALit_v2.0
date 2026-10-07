/**
 * Direct Postgres (pg) helpers — bypasses the Supabase REST admin client.
 *
 * Why this exists (2026-10-07):
 *   The Supabase REST admin client (`createAdminClient()`) uses the
 *   `SUPABASE_SERVICE_ROLE_KEY` env var. If that key is rotated in the
 *   Supabase dashboard and not updated in Vercel, every operation returns
 *   "Invalid API key". This module is the bypass.
 *
 *   We use `pg` with the direct Postgres connection string (already
 *   configured for migrations: POSTGRES_HOST, POSTGRES_PASSWORD, etc.).
 *   Serverless-friendly: one connection per cold start, released
 *   immediately after the query.
 *
 * What lives here:
 *   - CRUD on `public.email_verifications` (used by the OTP flow)
 *   - Profile-by-email lookup (used by signup/start's existing-email check)
 *
 * What does NOT live here (uses Supabase admin REST instead):
 *   - `auth.users` inserts (requires Supabase's GoTrue layer)
 *   - Anything behind the service role that needs RLS bypass
 *
 * How to use:
 *   Replace `createAdminClient().from('email_verifications').insert(...)`
 *   with `insertEmailVerification(...)` etc. Errors are normalised to the
 *   same shape as the @supabase/supabase-js client so callers don't need
 *   to change their error-handling.
 *
 * Env vars needed (all set in production as of 2026-10-07):
 *   - POSTGRES_HOST
 *   - POSTGRES_PORT  (default 5432)
 *   - POSTGRES_USER  (default "postgres")
 *   - POSTGRES_PASSWORD
 *   - POSTGRES_DB    (default "postgres")
 */

import { Client } from 'pg'

// Two ways to connect — depending on what's set in the env:
//
// 1. **POSTGRES_URL** (full connection string) — preferred in serverless
//    environments. Goes through Supavisor (the connection pooler), which
//    Vercel can route to. Vercel cannot make direct TCP connections to
//    Supabase's `db.<ref>.supabase.co` host from inside a serverless
//    function — DNS resolution fails (`ENOTFOUND`). The pooler URL is
//    different and works.
//
// 2. **POSTGRES_HOST + POSTGRES_PASSWORD** — used as a fallback (e.g.
//    for migrations running locally). Works on a developer machine but
//    not from Vercel functions.
//
// If neither is set, all helper functions return `error: 'pg not configured'`
// and the caller falls back to the Supabase REST admin client.
const HOST = process.env.POSTGRES_HOST
const PORT = Number(process.env.POSTGRES_PORT ?? 5432)
const PASSWORD = process.env.POSTGRES_PASSWORD
const USER = process.env.POSTGRES_USER ?? 'postgres'
const DATABASE = process.env.POSTGRES_DB ?? 'postgres'
const POOLER_URL = process.env.POSTGRES_URL ?? process.env.POSTGRES_URL_NON_POOLING

/** Build a one-shot pg client. Caller is responsible for .end(). */
export function createPgClient(): Client | null {
  if (POOLER_URL) {
    // Strip the `?pgbouncer=true` / `?sslmode=...` options and let pg figure
    // it out — pg accepts both `connectionString` and `ssl` overrides, but
    // mixing URL-encoded params with explicit options can confuse TLS.
    const base = POOLER_URL.split('?')[0]
    return new Client({
      connectionString: base,
      ssl: { rejectUnauthorized: false },
    })
  }
  if (HOST && PASSWORD) {
    return new Client({
      host: HOST,
      port: PORT,
      user: USER,
      password: PASSWORD,
      database: DATABASE,
      ssl: { rejectUnauthorized: false },
    })
  }
  return null
}

export interface DbResult<T> {
  data: T | null
  error: { message: string; code?: string; details?: string } | null
}

// ---------------------------------------------------------------------------
//  email_verifications table
// ---------------------------------------------------------------------------

export interface EmailVerificationRow {
  id: string
  email: string
  code_hash: string
  expires_at: string
  attempts: number
  verified_at: string | null
  consumed_at: string | null
  pending_payload: Record<string, unknown>
  ip_address: string | null
  user_agent: string | null
  created_at: string
}

export async function insertEmailVerification(args: {
  email: string
  pending_payload: Record<string, unknown>
  code_hash: string
  expires_at: string
  ip_address: string | null
  user_agent: string | null
}): Promise<DbResult<{ id: string }>> {
  const c = createPgClient()
  if (!c) return { data: null, error: { message: 'pg client not configured' } }
  try {
    await c.connect()
    const { rows } = await c.query<{ id: string }>(
      `INSERT INTO public.email_verifications
         (email, pending_payload, code_hash, expires_at, ip_address, user_agent)
       VALUES ($1, $2::jsonb, $3, $4, $5, $6)
       RETURNING id`,
      [
        args.email,
        JSON.stringify(args.pending_payload),
        args.code_hash,
        args.expires_at,
        args.ip_address,
        args.user_agent,
      ],
    )
    return { data: rows[0], error: null }
  } catch (e) {
    const err = e as { message?: string; code?: string; detail?: string }
    return { data: null, error: { message: err.message ?? 'unknown', code: err.code, details: err.detail } }
  } finally {
    await c.end()
  }
}

export async function selectEmailVerification(
  id: string,
): Promise<DbResult<EmailVerificationRow>> {
  const c = createPgClient()
  if (!c) return { data: null, error: { message: 'pg client not configured' } }
  try {
    await c.connect()
    const { rows } = await c.query<EmailVerificationRow>(
      `SELECT id, email, code_hash, expires_at, attempts, verified_at, consumed_at, pending_payload, ip_address, user_agent, created_at
       FROM public.email_verifications
       WHERE id = $1`,
      [id],
    )
    if (rows.length === 0) return { data: null, error: { message: 'not found', code: 'PGRST116' } }
    return { data: rows[0], error: null }
  } catch (e) {
    const err = e as { message?: string; code?: string; detail?: string }
    return { data: null, error: { message: err.message ?? 'unknown', code: err.code, details: err.detail } }
  } finally {
    await c.end()
  }
}

export async function updateEmailVerification(
  id: string,
  patch: Partial<{
    attempts: number
    verified_at: string | null
    consumed_at: string | null
  }>,
): Promise<DbResult<{ id: string }>> {
  const c = createPgClient()
  if (!c) return { data: null, error: { message: 'pg client not configured' } }
  try {
    await c.connect()
    const sets: string[] = []
    const params: unknown[] = []
    let p = 1
    if ('attempts' in patch) { sets.push(`attempts = $${p++}`); params.push(patch.attempts) }
    if ('verified_at' in patch) { sets.push(`verified_at = $${p++}`); params.push(patch.verified_at) }
    if ('consumed_at' in patch) { sets.push(`consumed_at = $${p++}`); params.push(patch.consumed_at) }
    if (sets.length === 0) return { data: { id }, error: null }
    params.push(id)
    const { rows } = await c.query<{ id: string }>(
      `UPDATE public.email_verifications SET ${sets.join(', ')} WHERE id = $${p} RETURNING id`,
      params,
    )
    if (rows.length === 0) return { data: null, error: { message: 'not found' } }
    return { data: rows[0], error: null }
  } catch (e) {
    const err = e as { message?: string; code?: string; detail?: string }
    return { data: null, error: { message: err.message ?? 'unknown', code: err.code, details: err.detail } }
  } finally {
    await c.end()
  }
}

export async function consumeUnverifiedCodesForEmail(email: string): Promise<DbResult<{ count: number }>> {
  const c = createPgClient()
  if (!c) return { data: null, error: { message: 'pg client not configured' } }
  try {
    await c.connect()
    const { rowCount } = await c.query(
      `UPDATE public.email_verifications
       SET consumed_at = NOW()
       WHERE email = $1 AND consumed_at IS NULL`,
      [email],
    )
    return { data: { count: rowCount ?? 0 }, error: null }
  } catch (e) {
    const err = e as { message?: string; code?: string; detail?: string }
    return { data: null, error: { message: err.message ?? 'unknown', code: err.code, details: err.detail } }
  } finally {
    await c.end()
  }
}

// ---------------------------------------------------------------------------
//  profiles table (for the email-already-exists check)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
//  profiles / tourists / buddies (used by signup/complete)
// ---------------------------------------------------------------------------

export async function upsertProfile(args: {
  id: string
  email: string
  full_name: string
  role: 'tourist' | 'buddy'
}): Promise<DbResult<{ id: string }>> {
  const c = createPgClient()
  if (!c) return { data: null, error: { message: 'pg client not configured' } }
  try {
    await c.connect()
    const { rows } = await c.query<{ id: string }>(
      `INSERT INTO public.profiles (id, email, full_name, role)
       VALUES ($1, $2, $3, $4::user_role)
       ON CONFLICT (id) DO NOTHING
       RETURNING id`,
      [args.id, args.email, args.full_name, args.role],
    )
    return { data: rows[0] ?? { id: args.id }, error: null }
  } catch (e) {
    const err = e as { message?: string; code?: string; detail?: string }
    return { data: null, error: { message: err.message ?? 'unknown', code: err.code, details: err.detail } }
  } finally {
    await c.end()
  }
}

export async function insertTourist(args: {
  id: string
  nationality?: string | null
  date_of_birth?: string | null
  travel_style?: string | null
  interests: string[]
  languages: string[]
  budget_range: string
  destination: string
  arrival_date?: string | null
}): Promise<DbResult<{ id: string }>> {
  const c = createPgClient()
  if (!c) return { data: null, error: { message: 'pg client not configured' } }
  try {
    await c.connect()
    const { rows } = await c.query<{ id: string }>(
      `INSERT INTO public.tourists
         (id, nationality, date_of_birth, travel_style, interests, languages, budget_range, destination, arrival_date, is_visible)
       VALUES ($1, $2, $3::date, $4, $5::text[], $6::text[], $7, $8, $9::date, true)
       RETURNING id`,
      [
        args.id,
        args.nationality ?? null,
        args.date_of_birth ?? null,
        args.travel_style ?? null,
        args.interests,
        args.languages,
        args.budget_range,
        args.destination,
        args.arrival_date ?? null,
      ],
    )
    return { data: rows[0], error: null }
  } catch (e) {
    const err = e as { message?: string; code?: string; detail?: string }
    return { data: null, error: { message: err.message ?? 'unknown', code: err.code, details: err.detail } }
  } finally {
    await c.end()
  }
}

export async function insertBuddy(args: {
  id: string
  location_city: string
  languages: string[]
  specialties: string[]
  hourly_rate: number
  bio: string
}): Promise<DbResult<{ id: string }>> {
  const c = createPgClient()
  if (!c) return { data: null, error: { message: 'pg client not configured' } }
  try {
    await c.connect()
    const { rows } = await c.query<{ id: string }>(
      `INSERT INTO public.buddies
         (id, location_city, languages, specialties, hourly_rate, bio, is_available)
       VALUES ($1, $2, $3::text[], $4::text[], $5, $6, true)
       RETURNING id`,
      [
        args.id,
        args.location_city,
        args.languages,
        args.specialties,
        args.hourly_rate,
        args.bio,
      ],
    )
    return { data: rows[0], error: null }
  } catch (e) {
    const err = e as { message?: string; code?: string; detail?: string }
    return { data: null, error: { message: err.message ?? 'unknown', code: err.code, details: err.detail } }
  } finally {
    await c.end()
  }
}

export async function deleteProfileByEmail(email: string): Promise<DbResult<{ count: number }>> {
  const c = createPgClient()
  if (!c) return { data: null, error: { message: 'pg client not configured' } }
  try {
    await c.connect()
    const { rowCount } = await c.query(
      `DELETE FROM public.profiles WHERE email = $1`,
      [email],
    )
    return { data: { count: rowCount ?? 0 }, error: null }
  } catch (e) {
    const err = e as { message?: string; code?: string; detail?: string }
    return { data: null, error: { message: err.message ?? 'unknown', code: err.code, details: err.detail } }
  } finally {
    await c.end()
  }
}

export async function findProfileIdByEmail(email: string): Promise<DbResult<{ id: string }>> {
  const c = createPgClient()
  if (!c) return { data: null, error: { message: 'pg client not configured' } }
  try {
    await c.connect()
    const { rows } = await c.query<{ id: string }>(
      `SELECT id FROM public.profiles WHERE email = $1 LIMIT 1`,
      [email],
    )
    if (rows.length === 0) return { data: null, error: { message: 'not found' } }
    return { data: rows[0], error: null }
  } catch (e) {
    const err = e as { message?: string; code?: string; detail?: string }
    return { data: null, error: { message: err.message ?? 'unknown', code: err.code, details: err.detail } }
  } finally {
    await c.end()
  }
}

// ---------------------------------------------------------------------------
//  auth.users + auth.identities — direct insert (bypasses GoTrue)
//
// Why this exists (2026-10-07):
//   The /auth/v1/signup endpoint is rate-limited per Supabase project
//   (~4 emails/hour on the free tier). When triggered, every signup
//   fails with `over_email_send_rate_limit`. We avoid that by inserting
//   the auth row directly via pg, the same way seed-accounts.mjs does it.
//
// What this does NOT do (vs the real GoTrue path):
//   - Does NOT trigger any confirmation/recovery email (we already
//     verified via OTP, so this is correct).
//   - Does NOT call auth hooks (on_auth_user_created still fires because
//     that's a database trigger, not a GoTrue hook).
//   - Sets `email_confirmed_at` directly so the user is signed in as
//     already-confirmed.
//
// SECURITY:
//   - Requires the `postgres` role (the pg pooler URL uses it).
//   - Password is bcrypt-hashed here to match what GoTrue would store.
// ---------------------------------------------------------------------------

// (no top-level bcrypt import — we use Postgres's built-in crypt() function
// with gen_salt('bf'), which is what GoTrue uses for sign-in password
// validation. bcryptjs produces a hash format that GoTrue's pgcrypto
// verification rejects.)

export async function createAuthUser(args: {
  email: string
  password: string
  full_name: string
  role: 'tourist' | 'buddy'
}): Promise<DbResult<{ id: string }>> {
  const c = createPgClient()
  if (!c) return { data: null, error: { message: 'pg client not configured' } }
  try {
    await c.connect()
    await c.query('BEGIN')
    const userId = crypto.randomUUID()

    // Strategy proven by scripts/fix-seed-users.mjs:
    //   1. INSERT a minimal auth.users row (just id + email + non-null defaults)
    //   2. UPDATE all the GoTrue-required columns with proper defaults
    //   3. INSERT auth.identities row
    // Doing the whole thing in one INSERT left a few columns NULL (e.g.
    // email_change, recovery_token) which made GoTrue's signin query fail
    // with "Database error querying schema".

    // Step 1: minimal insert
    await c.query(
      `INSERT INTO auth.users (id, email, instance_id, aud, role)
       VALUES ($1, $2, '00000000-0000-0000-0000-000000000000'::uuid, 'authenticated', 'authenticated')`,
      [userId, args.email],
    )

    // Step 2: full UPDATE with crypt() + all the default columns
    // Use crypt($pw, gen_salt('bf')) because that's what GoTrue's signin path
    // verifies against. bcryptjs produces a slightly different format.
    await c.query(
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
           raw_user_meta_data = COALESCE(raw_user_meta_data, $3::jsonb),
           created_at = COALESCE(created_at, now()),
           is_anonymous = false,
           is_sso_user = false,
           email_change_confirm_status = COALESCE(email_change_confirm_status, 0),
           updated_at = now()
       WHERE id = $1::uuid`,
      [
        userId,
        args.password,
        JSON.stringify({ full_name: args.full_name, role: args.role }),
      ],
    )

    // Step 3: insert the matching auth.identities row. Without this,
    // signInWithPassword fails because the user has no identity record.
    // We DO NOT use ::jsonb cast on identity_data here because the seed
    // script (fix-seed-users.mjs) does — and it works. jsonb_build_object
    // is safer than text→jsonb because it builds the JSON from values.
    await c.query(
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
      [userId, args.email],
    )

    await c.query('COMMIT')
    return { data: { id: userId }, error: null }
  } catch (e) {
    await c.query('ROLLBACK').catch(() => {})
    const err = e as { message?: string; code?: string; detail?: string }
    return { data: null, error: { message: err.message ?? 'unknown', code: err.code, details: err.detail } }
  } finally {
    await c.end()
  }
}