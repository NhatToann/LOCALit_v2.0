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
import { markSignupConsumed } from '@/utils/otp'
import {
  selectEmailVerification,
  findProfileIdByEmail,
  deleteProfileByEmail,
  upsertProfile,
  insertTourist,
  insertBuddy,
  createAuthUser,
} from '@/utils/db-pg'

type Role = 'tourist' | 'buddy'

interface CompleteBody {
  signupId?: string
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

  const { signupId, role, profilePayload } = body

  if (!signupId || typeof signupId !== 'string') {
    return NextResponse.json({ error: 'Missing signupId.' }, { status: 400 })
  }
  if (role !== 'tourist' && role !== 'buddy') {
    return NextResponse.json({ error: 'Invalid role.' }, { status: 400 })
  }

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
  if (new Date(signup.expires_at).getTime() < Date.now()) {
    return NextResponse.json({ error: 'Verification expired. Please start over.' }, { status: 410 })
  }

  const pending = signup.pending_payload as {
    email: string
    password_plain: string
    full_name: string
    phone: string | null
  }
  const emailStr = pending.email
  const cleanFullName = pending.full_name
  const passwordPlain = pending.password_plain

  // ---- Double-check email is still free -------------------------------------
  //
  // DEV escape hatch: when OTP_PREVIEW_ALLOW_REUSED=1, delete any existing
  // profile row that matches this email. This lets you re-register an
  // existing email during testing without manually cleaning the DB first.
  //
  // Production: reject duplicates (409) so sign-up remains a one-way door.
  if (process.env.OTP_PREVIEW_ALLOW_REUSED === '1') {
    console.warn(`[signup/complete] DEV: deleting existing profile for ${emailStr}`)
    await deleteProfileByEmail(emailStr)
  } else {
    const clash = await findProfileIdByEmail(emailStr)
    if (clash.data) {
      // Race condition: someone registered the same email between /start and /complete.
      return NextResponse.json(
        { error: 'This email is now registered. Please sign in.' },
        { status: 409 },
      )
    }
  }

  // ---- Create auth.users ----------------------------------------------------
  // 2026-10-07: direct insert into auth.users + auth.identities via pg
  // (utils/db-pg.createAuthUser). We previously hit the public
  // /auth/v1/signup endpoint here, but on the free tier that endpoint
  // triggers Supabase's project-wide email-send rate limit (4 emails/hr)
  // and fails with `over_email_send_rate_limit`. Since we've already
  // verified the email via our own OTP, there's no reason to ask GoTrue
  // to send another confirmation email — we just create the row directly.
  const authRes = await createAuthUser({
    email: emailStr,
    password: passwordPlain,
    full_name: cleanFullName,
    role,
  })
  if (authRes.error || !authRes.data) {
    const message = authRes.error?.message ?? 'unknown'
    const code = authRes.error?.code
    console.error(`[signup/complete] createAuthUser failed:`, message, code)
    // Surface duplicate email as 409, anything else as 400 generic.
    if (code === '23505') {
      return NextResponse.json(
        { error: 'This email is already registered. Please sign in.' },
        { status: 409 },
      )
    }
    return NextResponse.json(
      { error: 'Could not create account with these details. If you already have an account, please sign in.' },
      { status: 400 },
    )
  }
  const userId = authRes.data.id

  // ---- Defensive profiles upsert (pg-direct) --------------------------------
  const profileRes = await upsertProfile({
    id: userId,
    email: emailStr,
    full_name: cleanFullName,
    role,
  })
  if (profileRes.error) {
    console.warn('[signup/complete] profiles upsert warning:', profileRes.error.message)
  }

  // ---- Role-specific row (pg-direct) ----------------------------------------
  const cleanPayload = sanitizePayload(role, profilePayload ?? {})

  if (role === 'tourist') {
    const touristRes = await insertTourist({
      id: userId,
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
    })
    if (touristRes.error) {
      console.warn('[signup/complete] tourists insert warning:', touristRes.error.message)
    }
  } else {
    const buddyRes = await insertBuddy({
      id: userId,
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
    })
    if (buddyRes.error) {
      console.warn('[signup/complete] buddies insert warning:', buddyRes.error.message)
    }
  }

  // ---- Mark signup consumed (pg-direct) -------------------------------------
  await markSignupConsumed(signupId)

  return NextResponse.json({ userId, email: emailStr })
}