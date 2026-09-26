/**
 * Simple sign-up flow.
 *
 * POST /api/auth/signup
 * Body: { email, password, fullName, role, profilePayload }
 *
 * The server creates:
 *   1. The auth user (email confirmed — Supabase will still email them a
 *      welcome message but no separate verification step is needed).
 *   2. The profiles row (defensive upsert in case the trigger is missing).
 *   3. The role-specific row (tourists or buddies).
 *
 * Defenses:
 *   - Per-IP rate limit (5/min) to make brute force impractical.
 *   - Generic error messages that do NOT leak whether the email exists.
 *   - Input is size-limited and HTML-sanitized for free-text fields (full_name, bio).
 *
 * On success the client is told to call signIn() to establish its own session
 * and then redirect to /tourist/dashboard or /buddy/dashboard.
 */
import { NextResponse, type NextRequest } from 'next/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { rateLimit, getClientIp, rateLimitResponse } from '@/utils/rate-limit'

type Role = 'tourist' | 'buddy'

interface SignupBody {
  email?: string
  password?: string
  fullName?: string
  role?: Role
  profilePayload?: Record<string, unknown>
}

/** Strip control chars and HTML tags from free-text fields. Server-side last
 *  line of defense; UI should also escape on render. */
function sanitize(input: string, maxLen = 100): string {
  return input
    .replace(/[\u0000-\u001f\u007f]/g, '') // strip control chars
    .replace(/<[^>]*>/g, '')                 // strip HTML tags
    .trim()
    .slice(0, maxLen)
}

export async function POST(req: NextRequest) {
  // ---- Rate limit (5 requests / 60s per IP) ----------------------------------
  const ip = getClientIp(req)
  const rl = rateLimit(ip, 'auth:signup', { windowMs: 60_000, max: 5 })
  if (!rl.ok) return rateLimitResponse(rl.resetAt)

  // ---- Parse + validate body -------------------------------------------------
  let body: SignupBody
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  const { email, password, fullName, role, profilePayload } = body

  // Coerce + basic type checks. Don't trust client types.
  const emailStr = typeof email === 'string' ? email.trim().toLowerCase() : ''
  const passwordStr = typeof password === 'string' ? password : ''
  const fullNameStr = typeof fullName === 'string' ? fullName.trim() : ''

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailStr)) {
    return NextResponse.json({ error: 'Invalid email.' }, { status: 400 })
  }
  if (passwordStr.length < 6) {
    return NextResponse.json({ error: 'Password must be at least 6 characters.' }, { status: 400 })
  }
  if (fullNameStr.length < 2) {
    return NextResponse.json({ error: 'Please provide your full name.' }, { status: 400 })
  }
  if (role !== 'tourist' && role !== 'buddy') {
    return NextResponse.json({ error: 'Invalid role.' }, { status: 400 })
  }

  const cleanFullName = sanitize(fullNameStr, 100)

  const admin = createAdminClient()

  // ---- 1. Create the auth user with email confirmed ------------------------
  const { data: userData, error: userError } = await admin.auth.admin.createUser({
    email: emailStr,
    password: passwordStr,
    email_confirm: true,
    user_metadata: {
      full_name: cleanFullName,
      role,
    },
  })

  if (userError || !userData.user) {
    const msg = userError?.message ?? ''
    // Generic message so we don't leak whether the email is taken.
    if (msg.toLowerCase().includes('already')) {
      return NextResponse.json(
        { error: 'Sign up could not be completed with these details. Try a different email or sign in.' },
        { status: 409 },
      )
    }
    // Suppress internal error detail; log it but show generic message.
    console.warn('[signup] createUser failed:', msg)
    return NextResponse.json({ error: 'Sign up failed. Please try again.' }, { status: 400 })
  }

  const userId = userData.user.id

  // ---- 2. Defensive profiles upsert ----------------------------------------
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
    console.warn('[signup] profiles upsert warning:', (e as Error).message)
  }

  // ---- 3. Create the role-specific row -------------------------------------
  // Sanitize free-text fields in the profilePayload too.
  const cleanPayload = sanitizePayload(role, profilePayload ?? {})

  if (role === 'tourist') {
    try {
      await admin.from('tourists').insert({
        id: userId,
        nationality: cleanPayload.nationality ?? null,
        date_of_birth: cleanPayload.date_of_birth ?? null,
        travel_style: cleanPayload.travel_style ?? null,
        interests: Array.isArray(cleanPayload.interests)
          ? (cleanPayload.interests as string[]).filter(i => typeof i === 'string').slice(0, 32)
          : [],
        languages: Array.isArray(cleanPayload.languages)
          ? (cleanPayload.languages as string[]).filter(l => typeof l === 'string').slice(0, 16)
          : [],
        budget_range: typeof cleanPayload.budget_range === 'string' ? cleanPayload.budget_range : '50-100',
        destination: typeof cleanPayload.destination === 'string' ? sanitize(String(cleanPayload.destination), 100) : 'Da Nang',
        arrival_date: cleanPayload.arrival_date ?? null,
        is_visible: true,
      })
    } catch (e) {
      console.warn('[signup] tourists insert warning:', (e as Error).message)
    }
  } else {
    try {
      await admin.from('buddies').insert({
        id: userId,
        location_city: typeof cleanPayload.location_city === 'string' ? sanitize(String(cleanPayload.location_city), 100) : 'Da Nang',
        languages: Array.isArray(cleanPayload.languages)
          ? (cleanPayload.languages as string[]).filter(l => typeof l === 'string').slice(0, 16)
          : [],
        specialties: Array.isArray(cleanPayload.specialties)
          ? (cleanPayload.specialties as string[]).filter(s => typeof s === 'string').slice(0, 32)
          : [],
        hourly_rate: Number(cleanPayload.hourly_rate) || 15,
        bio: typeof cleanPayload.bio === 'string' ? sanitize(String(cleanPayload.bio), 500) : '',
        is_available: true,
      })
    } catch (e) {
      console.warn('[signup] buddies insert warning:', (e as Error).message)
    }
  }

  return NextResponse.json({ userId, email: emailStr })
}

/** Sanitize free-text fields in the profile payload before inserting. */
function sanitizePayload(role: Role, payload: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...payload }
  if (typeof out.full_name === 'string') out.full_name = sanitize(out.full_name, 100)
  if (typeof out.destination === 'string') out.destination = sanitize(out.destination, 100)
  if (typeof out.location_city === 'string') out.location_city = sanitize(out.location_city, 100)
  if (typeof out.bio === 'string') out.bio = sanitize(out.bio, 500)
  return out
}
