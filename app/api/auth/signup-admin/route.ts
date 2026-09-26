import { NextResponse, type NextRequest } from 'next/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { issueOtp } from '@/utils/otp'

type Role = 'tourist' | 'buddy'

interface SignupAdminBody {
  email?: string
  password?: string
  fullName?: string
  role?: Role
}

/**
 * Server-side sign-up. Creates the user (NOT confirmed), then issues a 6-digit
 * OTP code, emails it to the user via Resend, and returns the userId so the
 * client can navigate to /verify-email?email=... to enter the code.
 *
 * This is the entry point of the new "email verification required" flow:
 *   /register → /api/auth/signup-admin → /verify-email → /api/auth/verify-otp
 *                                                 → /api/auth/signin (auto) → /dashboard
 *
 * Notes:
 *   - Email is NOT auto-confirmed. The admin.auth.admin.updateUserById with
 *     email_confirm: true happens in /api/auth/verify-otp AFTER the user
 *     proves they own the email by submitting the code.
 *   - The on_auth_user_created trigger on auth.users inserts into
 *     public.profiles (best effort — defensive upsert lives in
 *     /api/auth/create-profile). The role-specific row (tourists/buddies) is
 *     written AFTER the user verifies their email, so we don't fill the DB
 *     with unverified rows.
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
    // IMPORTANT: do NOT confirm here. The user has to verify via OTP first.
    email_confirm: false,
    user_metadata: {
      full_name: fullName.trim(),
      role,
    },
  })

  if (error || !data.user) {
    const msg = error?.message ?? 'Could not create user.'
    return NextResponse.json({ error: msg }, { status: 400 })
  }

  const userId = data.user.id

  // Issue the verification code. Failures here are non-fatal — we still return
  // the userId so the client can navigate to /verify-email where the user can
  // request a resend. But we do surface the error so the UI can show a hint.
  const otpResult = await issueOtp(userId, email)
  if (!otpResult.ok) {
    console.error('[signup-admin] OTP issue failed:', otpResult.error)
    return NextResponse.json({
      userId,
      email,
      warning: `Account created but we couldn't send the verification email: ${otpResult.error}. Use the resend button on the next screen.`,
    })
  }

  return NextResponse.json({
    userId,
    email,
  })
}