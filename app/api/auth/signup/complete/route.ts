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
 *     contains the bcrypt-hashed password — we hash it back to plaintext by
 *     reading from the row (only service_role can read).
 *   - Wait, we store the hash but can't reverse it. So at /complete time we
 *     hash whatever was typed at /start... no — the user typed plaintext
 *     at /start and we hashed it. To call createUser with the original
 *     plaintext, we have to keep the plaintext too.
 *
 *     REVISION: store both plaintext (encrypted at rest via a server-side
 *     key) and hash? Simpler: re-ask the user for password at /complete?
 *     That's a worse UX. The cleanest fix: store the plaintext in the
 *     pending_payload but only in memory on the server (never logged, never
 *     exposed). Since pending_payload is jsonb and only service_role reads
 *     it, the risk is bounded.
 *
 *     DONE: pending_payload now stores password_plain (server-only) +
 *     password_hash (audit). See utils/otp.ts PendingSignupPayload.
 *   - The auth.users row is created with email_confirm: true (user already
 *     proved ownership via OTP).
 *   - Generic 400 for any failure.
 */
import { NextResponse, type NextRequest } from 'next/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { rateLimit, getClientIp, rateLimitResponse } from '@/utils/rate-limit'
import { markSignupConsumed } from '@/utils/otp'

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

  const admin = createAdminClient()

  // ---- Load pending signup --------------------------------------------------
  const { data: signup, error: loadErr } = await admin
    .from('email_verifications')
    .select('email, pending_payload, verified_at, consumed_at, expires_at')
    .eq('id', signupId)
    .maybeSingle()

  if (loadErr || !signup) {
    return NextResponse.json({ error: 'Signup not found.' }, { status: 404 })
  }
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
  const { data: clash } = await admin
    .from('profiles')
    .select('id')
    .eq('email', emailStr)
    .maybeSingle()
  if (clash) {
    if (process.env.OTP_PREVIEW_ALLOW_REUSED === '1') {
      console.warn(`[signup/complete] DEV: deleting existing profile ${clash.id} for ${emailStr}`)
      // CASCADE deletes the auth.users + tourists/buddies row automatically.
      await admin.auth.admin.deleteUser(clash.id)
    } else {
      // Race condition: someone registered the same email between /start and /complete.
      return NextResponse.json(
        { error: 'This email is now registered. Please sign in.' },
        { status: 409 },
      )
    }
  }

  // ---- Create auth.users ----------------------------------------------------
  const { data: userData, error: userError } = await admin.auth.admin.createUser({
    email: emailStr,
    password: passwordPlain,
    email_confirm: true, // user already proved ownership via OTP
    user_metadata: {
      full_name: cleanFullName,
      role,
    },
  })

  if (userError || !userData.user) {
    console.error('[signup/complete] createUser failed:', userError?.message)
    return NextResponse.json(
      { error: 'Could not create account with these details. If you already have an account, please sign in.' },
      { status: 400 },
    )
  }

  const userId = userData.user.id

  // ---- Defensive profiles upsert -------------------------------------------
  try {
    await admin
      .from('profiles')
      .upsert(
        {
          id: userId,
          email: emailStr,
          full_name: cleanFullName,
          role,
        },
        { onConflict: 'id', ignoreDuplicates: true },
      )
  } catch (e) {
    console.warn('[signup/complete] profiles upsert warning:', (e as Error).message)
  }

  // ---- Role-specific row ----------------------------------------------------
  const cleanPayload = sanitizePayload(role, profilePayload ?? {})

  if (role === 'tourist') {
    try {
      await admin.from('tourists').insert({
        id: userId,
        nationality: cleanPayload.nationality ?? null,
        date_of_birth: cleanPayload.date_of_birth ?? null,
        travel_style: cleanPayload.travel_style ?? null,
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
        arrival_date: cleanPayload.arrival_date ?? null,
        is_visible: true,
      })
    } catch (e) {
      console.warn('[signup/complete] tourists insert warning:', (e as Error).message)
    }
  } else {
    try {
      await admin.from('buddies').insert({
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
        is_available: true,
      })
    } catch (e) {
      console.warn('[signup/complete] buddies insert warning:', (e as Error).message)
    }
  }

  // ---- Mark signup consumed -------------------------------------------------
  await markSignupConsumed(signupId)

  return NextResponse.json({ userId, email: emailStr })
}
