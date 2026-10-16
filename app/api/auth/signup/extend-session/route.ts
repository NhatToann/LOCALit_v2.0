/**
 * Extend the session lifetime of an already-verified signup.
 *
 * POST /api/auth/signup/extend-session
 * Body: { signupId }
 *
 * Why this exists (2026-10-17):
 *   Once the user has verified the OTP, the only thing standing between
 *   them and a finished account is filling the Step 3 profile form. The
 *   row's `expires_at` is set at /start (15 min after the OTP was sent) —
 *   if the user pauses, the row expires and /complete returns 410.
 *
 *   This route extends `expires_at` by another 15 min from now, so the
 *   user can finish Step 3 without rushing or re-verifying. The client
 *   may call this silently while the user is filling the profile (e.g.
 *   when the countdown drops below 60s) or explicitly as a "Refresh
 *   session" button if the server returns 410 from /complete.
 *
 *   - No OTP re-check. The user already proved ownership of the email.
 *   - signupId is a UUID (unguessable). Treat it as a bearer secret.
 *   - 410 if the row is missing, already-consumed, or never verified.
 *   - 5 req / 60s / IP rate limit (so a stolen signupId can't be polled
 *     to keep the row alive forever).
 *
 * Returns: { expiresAt } — the new ISO timestamp, so the client can show
 * a fresh countdown.
 */

import { NextResponse, type NextRequest } from 'next/server'
import { rateLimit, getClientIp, rateLimitResponse } from '@/utils/rate-limit'
import { extendSignupSession } from '@/utils/extend-signup-session'

interface ExtendBody {
  signupId?: string
}

export async function POST(req: NextRequest) {
  const ip = getClientIp(req)
  const rl = rateLimit(ip, 'auth:signup-extend', { windowMs: 60_000, max: 5 })
  if (!rl.ok) return rateLimitResponse(rl.resetAt)

  let body: ExtendBody
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  const { signupId } = body
  if (!signupId || typeof signupId !== 'string') {
    return NextResponse.json({ error: 'Missing signupId.' }, { status: 400 })
  }

  const result = await extendSignupSession(signupId)
  if (!result.ok) {
    const status =
      result.reason === 'already_completed'
        ? 410
        : result.reason === 'not_verified'
          ? 403
          : result.reason === 'db_error'
            ? 500
            : 404
    return NextResponse.json({ error: result.error }, { status })
  }

  return NextResponse.json({ ok: true, expiresAt: result.expiresAt })
}