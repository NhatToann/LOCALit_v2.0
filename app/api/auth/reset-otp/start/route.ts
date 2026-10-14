/**
 * POST /api/auth/reset-otp/start
 *
 * Body: { email }
 * → issues a 6-digit reset code, mails it, returns { resetId }.
 *
 * WHY THIS EXISTS (2026-10-11)
 *   `/auth/v1/recover` is throttled per-recipient with a 429 that lasts
 *   hours, so the Supabase recovery-link flow silently delivers nothing on
 *   this project. This route mails the code through `sendEmail()` (SMTP /
 *   Resend), which is unaffected by GoTrue's throttle.
 *
 * SECURITY — no user enumeration (same rule as signup/start):
 *   An unknown address still gets a code row and a "sent" response, so the
 *   endpoint cannot be used to discover which emails are registered. We do
 *   NOT check whether the account exists before responding.
 *
 * Defenses:
 *   - 3 requests / 60s / IP (tighter than signup: this endpoint is the
 *     cheapest way to spam a known address).
 *   - Generic 400 on bad input, 200 on success regardless of the address.
 *   - Codes are bcrypt-hashed at rest; plaintext exists only in the email
 *     and (in dev) the OTP_PREVIEW response.
 */
import { NextResponse, type NextRequest } from 'next/server'
import { rateLimit, getClientIp, rateLimitResponse } from '@/utils/rate-limit'
import { issueResetOtp } from '@/utils/reset-otp'

const EMAIL_MAX = 254

export async function POST(req: NextRequest) {
  const ip = getClientIp(req)
  const rl = rateLimit(ip, 'auth:reset-otp-start', { windowMs: 60_000, max: 3 })
  if (!rl.ok) return rateLimitResponse(rl.resetAt)

  let body: { email?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  const email =
    typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''

  if (!email || email.length > EMAIL_MAX) {
    return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 })
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 })
  }

  const result = await issueResetOtp(email, {
    ip,
    userAgent: req.headers.get('user-agent') ?? null,
  })

  // A mail-transport failure is our problem, not the user's email problem,
  // so it is safe (and useful) to surface it.
  if (!result.ok) {
    console.error(`[reset-otp/start] ${result.error}`)
    return NextResponse.json(
      { error: 'Could not send the reset email. Please try again in a moment.' },
      { status: 500 },
    )
  }

  const payload: Record<string, unknown> = {
    resetId: result.resetId,
    email,
    expiresInSeconds: 15 * 60,
  }
  // Dev-only echo so the flow is testable without an inbox. Unset in prod.
  if (result.devCode) payload.__devCode = result.devCode

  return NextResponse.json(payload)
}