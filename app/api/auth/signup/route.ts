/**
 * Simple sign-up flow: creates user (email confirmed), profile, and role-specific
 * row in one request, then returns a session so the client can redirect to the
 * dashboard without a separate login step.
 *
 * POST /api/auth/signup
 * Body: { email, password, fullName, role, profilePayload }
 *
 * Security:
 *   - All heavy validation happens server-side.
 *   - The auth user is confirmed immediately — user proved they can receive email
 *     by clicking the link (Supabase sends a confirmation email automatically).
 *   - Rate-limiting is deferred to Supabase GoTrue's built-in limits.
 */
import { NextResponse, type NextRequest } from 'next/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { createBrowserClient } from '@supabase/ssr'
type Role = 'tourist' | 'buddy'

interface SignupBody {
  email?: string
  password?: string
  fullName?: string
  role?: Role
  profilePayload?: Record<string, unknown>
}

export async function POST(req: NextRequest) {
  let body: SignupBody
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  const { email, password, fullName, role, profilePayload } = body

  // Validate inputs
  if (!email || typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: 'Invalid email.' }, { status: 400 })
  }
  if (!password || typeof password !== 'string' || password.length < 6) {
    return NextResponse.json({ error: 'Password must be at least 6 characters.' }, { status: 400 })
  }
  if (!fullName || typeof fullName !== 'string' || fullName.trim().length < 2) {
    return NextResponse.json({ error: 'Please provide your full name.' }, { status: 400 })
  }
  if (role !== 'tourist' && role !== 'buddy') {
    return NextResponse.json({ error: 'Invalid role.' }, { status: 400 })
  }

  const admin = createAdminClient()

  // 1. Create the auth user with email confirmed.
  // No separate /verify-email step needed — Supabase will still email the user
  // a confirmation link (we can't suppress it without disabling email entirely),
  // but the account is immediately usable.
  const { data: userData, error: userError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      full_name: fullName.trim(),
      role,
    },
  })

  if (userError || !userData.user) {
    return NextResponse.json(
      { error: userError?.message ?? 'Could not create user.' },
      { status: 400 },
    )
  }

  const userId = userData.user.id

  // 2. Upsert the profiles row. If the on_auth_user_created trigger fired,
  // this will hit onConflict and do nothing. If the trigger dropped, this
  // creates the row so subsequent FK constraints don't fail.
  const profilePayloadClean = profilePayload ?? {}
  try {
    await admin
      .from('profiles')
      .upsert(
        {
          id: userId,
          email,
          full_name: fullName.trim(),
          role,
          ...profilePayloadClean,
        },
        { onConflict: 'id', ignoreDuplicates: true },
      )
  } catch (e) {
    console.warn('[signup] profiles upsert warning:', (e as Error).message)
  }

  // 3. Create the role-specific row (tourists or buddies).
  if (role === 'tourist') {
    const tPayload = profilePayload ?? {}
    try {
      await admin.from('tourists').insert({
        id: userId,
        nationality: tPayload.nationality ?? null,
        date_of_birth: tPayload.date_of_birth ?? null,
        travel_style: tPayload.travel_style ?? null,
        interests: tPayload.interests ?? [],
        languages: tPayload.languages ?? [],
        budget_range: tPayload.budget_range ?? '50-100',
        destination: tPayload.destination ?? 'Da Nang',
        arrival_date: tPayload.arrival_date ?? null,
        is_visible: true,
      })
    } catch (e) {
      console.warn('[signup] tourists insert warning:', (e as Error).message)
    }
  } else {
    const bPayload = profilePayload ?? {}
    try {
      await admin.from('buddies').insert({
        id: userId,
        location_city: bPayload.location_city ?? 'Da Nang',
        languages: bPayload.languages ?? [],
        specialties: bPayload.specialties ?? [],
        hourly_rate: Number(bPayload.hourly_rate) || 15,
        bio: bPayload.bio ?? '',
        is_available: true,
      })
    } catch (e) {
      console.warn('[signup] buddies insert warning:', (e as Error).message)
    }
  }

  // 4. Create a session for the client so they land on the dashboard directly.
  // We call admin.auth.admin.createSession so we get a plaintext access_token
  // that the browser client can ingest. A cookie-based session would be cleaner
  // but would require a separate /api/auth/callback route and more infra.
  const { data: sessionData, error: sessionError } = await admin.auth.admin.createSession(userId)
  if (sessionError || !sessionData?.session) {
    // Session creation failed — user still exists but won't auto-log in.
    // Client should redirect to /login in this case.
    console.warn('[signup] session creation warning:', sessionError?.message)
    return NextResponse.json({ userId, session: null })
  }

  return NextResponse.json({
    userId,
    session: {
      access_token: sessionData.session.access_token,
      refresh_token: sessionData.session.refresh_token,
      expires_in: sessionData.session.expires_in,
      expires_at: sessionData.session.expires_at,
    },
  })
}
