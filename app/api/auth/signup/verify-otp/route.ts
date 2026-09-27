/**
 * Step 2 of the new OTP signup flow.
 *
 * POST /api/auth/signup/verify-otp
 * Body: { signupId, code }
 *
 * Verifies the 6-digit code against the active pending signup row.
 * On success, sets verified_at (consumed_at stays null until /complete runs).
 *
 * SECURITY:
 *   - signupId is a UUID, treated as a bearer secret.
 *   - Constant-time error messages: wrong code, expired, and too-many-attempts
 *     all return the same 410 status + generic message (no enumeration).
 *   - 10 attempts / 60s per IP rate limit.
 *   - 5 wrong codes invalidates the code (forces resend).
 */
import { NextResponse, type NextRequest } from 'next/server'
import { rateLimit, getClientIp, rateLimitResponse } from '@/utils/rate-limit'
import { consumeOtp } from '@/utils/otp'

interface VerifyBody {
  signupId?: string
  code?: string
}

export async function POST(req: NextRequest) {
  const ip = getClientIp(req)
  const rl = rateLimit(ip, 'auth:signup-verify', { windowMs: 60_000, max: 10 })
  if (!rl.ok) return rateLimitResponse(rl.resetAt)

  let body: VerifyBody
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  const { signupId, code } = body

  if (!signupId || typeof signupId !== 'string') {
    return NextResponse.json({ error: 'Missing signupId.' }, { status: 400 })
  }
  if (!code || typeof code !== 'string' || !/^\d{6}$/.test(code)) {
    return NextResponse.json({ error: 'Code must be 6 digits.' }, { status: 400 })
  }

  const result = await consumeOtp(signupId, code)
  if (!result.ok) {
    const status = result.reason === 'wrong_code' ? 400 : 410
    return NextResponse.json(
      { error: result.error, reason: result.reason },
      { status },
    )
  }

  return NextResponse.json({ ok: true, signupId: result.signupId, email: result.payload.email })
}
