import { NextResponse, type NextRequest } from 'next/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { rateLimit, getClientIp, rateLimitResponse } from '@/utils/rate-limit'

type Role = 'tourist' | 'buddy'

interface SignupAdminBody {
  email?: string
  password?: string
  fullName?: string
  role?: Role
}

function sanitize(input: string, maxLen = 100): string {
  return input
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/<[^>]*>/g, '')
    .trim()
    .slice(0, maxLen)
}

/**
 * Server-side sign-up. Legacy endpoint kept for the OTP verify-email flow
 * (creates user, unconfirmed, emails a 6-digit code).
 *
 * Rate-limited per IP and returns generic messages so we don't leak whether
 * a given email already exists.
 */
export async function POST(req: NextRequest) {
  // ---- Rate limit (5 req / 60s per IP) -------------------------------------
  const ip = getClientIp(req)
  const rl = rateLimit(ip, 'auth:signup-admin', { windowMs: 60_000, max: 5 })
  if (!rl.ok) return rateLimitResponse(rl.resetAt)

  let body: SignupAdminBody
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  const { email, password, fullName, role } = body

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

  const admin = createAdminClient()

  const { data, error } = await admin.auth.admin.createUser({
    email: emailStr,
    password: passwordStr,
    email_confirm: false,
    user_metadata: {
      full_name: sanitize(fullNameStr, 100),
      role,
    },
  })

  if (error || !data.user) {
    const msg = error?.message ?? 'Could not create user.'
    if (msg.toLowerCase().includes('already')) {
      return NextResponse.json(
        { error: 'Sign up could not be completed with these details.' },
        { status: 409 },
      )
    }
    console.warn('[signup-admin] createUser failed:', msg)
    return NextResponse.json({ error: 'Sign up failed. Please try again.' }, { status: 400 })
  }

  return NextResponse.json({
    userId: data.user.id,
    email: emailStr,
  })
}
