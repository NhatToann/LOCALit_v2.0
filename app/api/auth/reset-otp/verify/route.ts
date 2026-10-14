/**
 * POST /api/auth/reset-otp/verify
 *
 * Body: { resetId, code }
 * → checks the 6-digit code and, if it matches, marks the row verified so
 *   /complete will accept a new password.
 *
 * `resetId` alone is not enough: without the correct code this endpoint
 * cannot be used to reach /complete.
 *
 * Defenses:
 *   - 10 requests / 60s / IP.
 *   - 5 wrong codes invalidates the row (MAX_ATTEMPTS in utils/reset-otp.ts).
 *   - The code must be exactly 6 digits.
 */
import { NextResponse, type NextRequest } from 'next/server'
import { rateLimit, getClientIp, rateLimitResponse } from '@/utils/rate-limit'
import { verifyResetOtp } from '@/utils/reset-otp'

export async function POST(req: NextRequest) {
  const ip = getClientIp(req)
  const rl = rateLimit(ip, 'auth:reset-otp-verify', { windowMs: 60_000, max: 10 })
  if (!rl.ok) return rateLimitResponse(rl.resetAt)

  let body: { resetId?: string; code?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  const resetId = typeof body.resetId === 'string' ? body.resetId.trim() : ''
  const code = typeof body.code === 'string' ? body.code.trim() : ''

  if (!resetId) {
    return NextResponse.json({ error: 'Missing resetId.' }, { status: 400 })
  }
  if (!/^\d{6}$/.test(code)) {
    return NextResponse.json({ error: 'Enter the 6-digit code from your email.' }, { status: 400 })
  }

  const result = await verifyResetOtp(resetId, code)

  if (!result.ok) {
    // 400 for a wrong code (retryable), 410 for anything terminal.
    const status = result.reason === 'wrong_code' ? 400 : 410
    return NextResponse.json(
      { error: result.error, reason: result.reason },
      { status },
    )
  }

  return NextResponse.json({ ok: true, email: result.email })
}