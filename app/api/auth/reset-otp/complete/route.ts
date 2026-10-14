/**
 * POST /api/auth/reset-otp/complete
 *
 * Body: { resetId, password }
 * → writes the new password hash with pg and burns the code.
 *
 * Requires `verified_at` to be set by /verify, so the caller must have
 * proven inbox possession with the correct code first.
 *
 * SECURITY:
 *   - The password policy is enforced server-side by validatePassword
 *     (>= 10 chars, a letter, a non-letter) — never trust the client.
 *   - `setUserPasswordByEmail` clears recovery/reauth tokens in the same
 *     statement, so any reset LINK issued earlier stops working at the
 *     moment the new password is set.
 *   - bcrypt at 10 rounds via crypt() (the format GoTrue verifies).
 *   - Response is generic; it never reveals whether an address exists.
 *
 * Defenses: 5 requests / 60s / IP.
 */
import { NextResponse, type NextRequest } from 'next/server'
import { rateLimit, getClientIp, rateLimitResponse } from '@/utils/rate-limit'
import { completePasswordReset } from '@/utils/reset-otp'

const MAX_PASSWORD = 128

export async function POST(req: NextRequest) {
  const ip = getClientIp(req)
  const rl = rateLimit(ip, 'auth:reset-otp-complete', { windowMs: 60_000, max: 5 })
  if (!rl.ok) return rateLimitResponse(rl.resetAt)

  let body: { resetId?: string; password?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  const resetId = typeof body.resetId === 'string' ? body.resetId.trim() : ''
  const password = typeof body.password === 'string' ? body.password : ''

  if (!resetId) {
    return NextResponse.json({ error: 'Missing resetId.' }, { status: 400 })
  }
  if (!password || password.length > MAX_PASSWORD) {
    return NextResponse.json(
      { error: 'Password must be between 10 and 128 characters.' },
      { status: 400 },
    )
  }

  const result = await completePasswordReset(resetId, password)

  if (!result.ok) {
    // Not-yet-verified is a 400 (the user still has steps to do); an
    // expired/burned request is 410.
    const status = result.reason === 'weak_password' ? 400 : 410
    console.error(`[reset-otp/complete] ${result.reason}: ${result.error}`)
    return NextResponse.json({ error: result.error, reason: result.reason }, { status })
  }

  return NextResponse.json({ ok: true })
}