import { NextResponse, type NextRequest } from 'next/server'
import { createAdminClient } from '@/utils/supabase/admin'

type Role = 'tourist' | 'buddy'

interface SignupAdminBody {
  email?: string
  password?: string
  fullName?: string
  role?: Role
}

/**
 * Server-side sign-up that uses the Supabase admin API to create the user with
 * email already confirmed. This is the path the register page uses when the
 * project still has "Confirm email" enabled (the GoTrue REST /auth/v1/signup
 * endpoint both emails the user AND is rate-limited; for in-app Kỳ-8 demos we
 * skip the email step and confirm immediately).
 *
 * Important: the on_auth_user_created trigger on auth.users currently inserts
 * into public.profiles with role='tourist' if raw_user_meta_data->>'role' is
 * missing. We pass the role here so the trigger writes the right role.
 *
 * After the user exists, the route's caller (register page) is expected to
 * follow up with POST /api/auth/create-profile to write the role-specific row
 * (tourists/buddies). That route already handles auto-confirming and
 * upserting defensively.
 */
export async function POST(req: NextRequest) {
  let body: SignupAdminBody
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  const { email, password, fullName, role } = body

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

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      full_name: fullName.trim(),
      role,
    },
  })

  if (error || !data.user) {
    // Surface helpful, user-safe messages
    const msg = error?.message ?? 'Could not create user.'
    return NextResponse.json({ error: msg }, { status: 400 })
  }

  return NextResponse.json({
    userId: data.user.id,
    email: data.user.email,
  })
}
