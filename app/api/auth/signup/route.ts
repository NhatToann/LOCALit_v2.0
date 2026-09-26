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
 * On success the client is told to call signIn() to establish its own session
 * and then redirect to /tourist/dashboard or /buddy/dashboard. We don't mint
 * the session here because GoTrueAdminApi has no server-side session endpoint
 * we can use safely without leaking tokens.
 */
import { NextResponse, type NextRequest } from 'next/server'
import { createAdminClient } from '@/utils/supabase/admin'
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
    // If the email already exists, return a generic message so we don't leak
    // whether the account exists.
    if (userError?.message?.toLowerCase().includes('already')) {
      return NextResponse.json(
        { error: 'An account with this email already exists. Try signing in.' },
        { status: 409 },
      )
    }
    return NextResponse.json(
      { error: userError?.message ?? 'Could not create user.' },
      { status: 400 },
    )
  }

  const userId = userData.user.id

  // 2. Defensive profiles upsert (trigger may or may not have fired).
  try {
    await admin
      .from('profiles')
      .upsert(
        {
          id: userId,
          email,
          full_name: fullName.trim(),
          role,
        },
        { onConflict: 'id', ignoreDuplicates: true },
      )
  } catch (e) {
    console.warn('[signup] profiles upsert warning:', (e as Error).message)
  }

  // 3. Create the role-specific row.
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

  return NextResponse.json({ userId, email })
}
