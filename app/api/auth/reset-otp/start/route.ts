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

  // No-enumeration (2026-10-14): always return the same shape regardless of
  // whether the email exists, the row was written, or the mail transport
  // succeeded. The downstream /verify and /complete endpoints give the same
  // generic "code is not correct" / "reset request is no longer valid"
  // responses for unknown emails, so a caller cannot tell whether the
  // address is registered by probing this endpoint.
  //
  // When the row was never written (mail transport failed), fall back to a
  // sentinel resetId so the response shape is preserved. The /verify route
  // will return `no_code` (410) for that sentinel, which the page handles
  // by re-showing the email-entry form — the same flow as an expired
  // request. This avoids a 500 on a Resend test-mode rejection (which only
  // allows the Resend account-owner address to receive mail).
  if (!result.ok) {
    console.error(`[reset-otp/start] ${result.error}`)
    return NextResponse.json({
      resetId: '00000000-0000-0000-0000-000000000000',
      email,
      expiresInSeconds: 15 * 60,
    })
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