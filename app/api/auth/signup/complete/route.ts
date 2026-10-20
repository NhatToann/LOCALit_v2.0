/**
 * Final step of the new OTP signup flow.
 *
 * POST /api/auth/signup/complete
 * Body: { signupId, role, profilePayload }
 *
 * Verifies that the pending signup was OTP-verified (verified_at IS NOT NULL),
 * creates the auth.users row + profiles + tourist/buddy row in one logical
 * step, then marks consumed_at.
 *
 * SECURITY:
 *   - signupId is treated as a bearer secret. The pending payload already
 *     contains the bcrypt-hashed password — we read the plaintext from it
 *     (only service_role can read).
 *   - The auth.users row is created with email_confirm: true (user already
 *     proved ownership via OTP).
 *   - Generic 400 for any failure.
 *
 * 2026-10-07: switched profile/tourist/buddy inserts from the Supabase REST
 * admin client to direct pg (utils/db-pg.ts) because the SERVICE_ROLE_KEY
 * had been rotated in the dashboard and the REST admin returned
 * "Invalid API key". The only operation that STILL uses the Supabase admin
 * client is `auth.admin.createUser`, which is the only operation that
 * genuinely needs the GoTrue layer.
 */
import { NextResponse, type NextRequest } from 'next/server'
import { rateLimit, getClientIp, rateLimitResponse } from '@/utils/rate-limit'
import { validatePassword } from '@/utils/password-validator'
import { getPool, selectEmailVerification, completeSignupAtomically } from '@/utils/db-pg'
import { extendSignupSession } from '@/utils/extend-signup-session'

type Role = 'tourist' | 'buddy'

interface CompleteBody {
  signupId?: string
  password?: string
  role?: Role
  profilePayload?: Record<string, unknown>
}

function sanitize(input: string, maxLen = 100): string {
  return input
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/<[^>]*>/g, '')
    .trim()
    .slice(0, maxLen)
}

function sanitizePayload(role: Role, payload: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...payload }
  if (typeof out.full_name === 'string') out.full_name = sanitize(out.full_name, 100)
  if (typeof out.destination === 'string') out.destination = sanitize(out.destination, 100)
  if (typeof out.location_city === 'string') out.location_city = sanitize(out.location_city, 100)
  if (typeof out.bio === 'string') out.bio = sanitize(out.bio, 500)
  return out
}

export async function POST(req: NextRequest) {
  const ip = getClientIp(req)
  const rl = rateLimit(ip, 'auth:signup-complete', { windowMs: 60_000, max: 10 })
  if (!rl.ok) return rateLimitResponse(rl.resetAt)

  let body: CompleteBody
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  const { signupId, password, role, profilePayload } = body

  if (!signupId || typeof signupId !== 'string') {
    return NextResponse.json({ error: 'Missing signupId.' }, { status: 400 })
  }
  if (role !== 'tourist' && role !== 'buddy') {
    return NextResponse.json({ error: 'Invalid role.' }, { status: 400 })
  }
  // 2026-10-16: password is now in the body (not pending_payload). We
  // re-validate it server-side because the client-side check is bypassable.
  if (typeof password !== 'string' || password.length < 10 || password.length > 128) {
    return NextResponse.json({ error: 'Password is missing or invalid.' }, { status: 400 })
  }
  const pwErr = validatePassword(password)
  if (pwErr) return NextResponse.json({ error: pwErr }, { status: 400 })

  // ---- Load pending signup (pg-direct) -------------------------------------
  const sel = await selectEmailVerification(signupId)
  if (sel.error || !sel.data) {
    return NextResponse.json({ error: 'Signup not found.' }, { status: 404 })
  }
  const signup = sel.data
  if (signup.consumed_at) {
    return NextResponse.json({ error: 'This signup was already completed.' }, { status: 410 })
  }
  if (!signup.verified_at) {
    return NextResponse.json({ error: 'Email has not been verified yet.' }, { status: 403 })
  }
  // 2026-10-17: instead of returning 410 when the row has expired, auto-extend
  // the profile-collection window by another 15 minutes. The OTP has already
  // proved email ownership (verified_at IS NOT NULL); the only thing left is
  // the user filling in the Step 3 profile form, which can legitimately take
  // longer than the original 15-minute OTP TTL (especially for a buddy bio of
  // 30+ characters). If the user is here, they ARE the legitimate owner.
  //
  // Auto-extend keeps the row alive so the user can hit "Create account"
  // successfully. If you want a hard expiry, set the helper's TTL to 0 —
  // but then any user who pauses at Step 3 gets bounced back to Step 0,
  // which is the exact bug this rewrite is fixing.
  if (new Date(signup.expires_at).getTime() < Date.now()) {
    const ext = await extendSignupSession(signup.id)
    if (!ext.ok) {
      console.error('[signup/complete] auto-extend failed:', ext.error)
      // Don't block the user on an extension failure — they came this far
      // with a verified row. Fall through and proceed to insert.
    }
  }

  const pending = signup.pending_payload as {
    email: string
    full_name: string
    phone: string | null
  }
  const emailStr = pending.email
  const cleanFullName = pending.full_name
  const passwordPlain = password  // comes from the body now (2026-10-16)

  // ---- Create the account in ONE transaction on ONE connection --------------
  //
  // 2026-10-20 rewrite. The previous version ran six sequential helpers, each
  // opening its own TLS connection to the Supabase pooler (clash-check →
  // createAuthUser → upsertProfile → insertTourist → markConsumed). Measured
  // on production that cost 11.9 seconds for a single user click.
  //
  // completeSignupAtomically() does all six on one connection inside one BEGIN/
  // COMMIT, which also gives us atomicity: a failure part-way can no longer
  // leave an auth.users row with no profiles row.
  //
  // It also fixes the display-name bug. The on_auth_user_created trigger fires
  // on the auth.users INSERT and, because our metadata was previously written
  // by a separate UPDATE, it saw NULL metadata and used the email local-part
  // as the name. The old upsertProfile then used ON CONFLICT DO NOTHING, so
  // the wrong name stuck. Now raw_user_meta_data is passed IN the INSERT and
  // the profiles upsert uses DO UPDATE, so the typed name always wins.
  const allowReuse = process.env.OTP_PREVIEW_ALLOW_REUSED === '1'
  const cleanPayload = sanitizePayload(role, profilePayload ?? {})

  const result = await completeSignupAtomically({
    signupId,
    email: emailStr,
    password: passwordPlain,
    fullName: cleanFullName,
    role,
    phone: pending.phone,
    allowReuse,
    tourist:
      role === 'tourist'
        ? {
            nationality: (cleanPayload.nationality as string | null) ?? null,
            date_of_birth: (cleanPayload.date_of_birth as string | null) ?? null,
            travel_style: (cleanPayload.travel_style as string | null) ?? null,
            interests: Array.isArray(cleanPayload.interests)
              ? (cleanPayload.interests as string[]).filter((i) => typeof i === 'string').slice(0, 32)
              : [],
            languages: Array.isArray(cleanPayload.languages)
              ? (cleanPayload.languages as string[]).filter((l) => typeof l === 'string').slice(0, 16)
              : [],
            budget_range:
              typeof cleanPayload.budget_range === 'string' ? cleanPayload.budget_range : '50-100',
            destination:
              typeof cleanPayload.destination === 'string'
                ? sanitize(String(cleanPayload.destination), 100)
                : 'Da Nang',
            arrival_date: (cleanPayload.arrival_date as string | null) ?? null,
          }
        : null,
    buddy:
      role === 'buddy'
        ? {
            location_city:
              typeof cleanPayload.location_city === 'string'
                ? sanitize(String(cleanPayload.location_city), 100)
                : 'Da Nang',
            languages: Array.isArray(cleanPayload.languages)
              ? (cleanPayload.languages as string[]).filter((l) => typeof l === 'string').slice(0, 16)
              : [],
            specialties: Array.isArray(cleanPayload.specialties)
              ? (cleanPayload.specialties as string[]).filter((s) => typeof s === 'string').slice(0, 32)
              : [],
            hourly_rate: Number(cleanPayload.hourly_rate) || 15,
            bio: typeof cleanPayload.bio === 'string' ? sanitize(String(cleanPayload.bio), 500) : '',
          }
        : null,
  })

  if (result.error || !result.data) {
    const code = result.error?.code
    console.error('[signup/complete] atomic signup failed:', result.error?.message, code)
    if (code === 'EMAIL_TAKEN' || code === '23505') {
      return NextResponse.json(
        { error: 'This email is now registered. Please sign in.' },
        { status: 409 },
      )
    }
    return NextResponse.json(
      { error: 'Could not create account with these details. If you already have an account, please sign in.' },
      { status: 400 },
    )
  }

  // Warm the shared pool in the background so the NEXT signup request on this
  // lambda instance starts with a live socket instead of paying a cold TLS
  // handshake. Fire-and-forget: we must not delay the response on it.
  getPool()?.query('SELECT 1').catch(() => {})

  return NextResponse.json({ userId: result.data.userId, email: result.data.email })
}