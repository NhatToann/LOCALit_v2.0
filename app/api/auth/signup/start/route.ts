/**
 * Step 1 of the new OTP signup flow.
 *
 * POST /api/auth/signup/start
 * Body: { email, fullName, phone? }
 *
 * Creates a pending signup row in public.email_verifications (keyed by email —
 * NO auth.users row yet, NO password stored here), generates a 6-digit OTP,
 * and emails it.
 * Returns { signupId } — the client stores it and uses it for verify-otp
 * and complete.
 *
 * The password is NOT in this body. It lives in client state and is sent
 * in the final /complete request, after the OTP is verified. This way a
 * drop-off after OTP verify leaves no credential material in the DB.
 *
 * Defenses:
 *   - Per-IP rate limit (5/min) to make OTP-spam impractical.
 *   - Generic 400 response for any failure (does NOT leak whether the email
 *     is already registered — both "fresh" and "already taken" look the same).
 *   - Email format + length caps.
 *
 * The flow:
 *   /register Step 0 (personal info — name, email, phone, password, role, terms)
 *   → POST /api/auth/signup/start  (this endpoint — no password)
 *   → /register Step 1 (enter 6-digit code)
 *   → POST /api/auth/signup/verify-otp
 *   → /register Step 2 (role-specific tags/bio)
 *   → POST /api/auth/signup/complete  (carries the password)
 *   → user is signed in, redirected to dashboard.
 */
import { NextResponse, type NextRequest } from 'next/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { rateLimit, getClientIp, rateLimitResponse } from '@/utils/rate-limit'
import { issueOtpForSignup, type PendingSignupPayload } from '@/utils/otp'
import { findProfileIdByEmail } from '@/utils/db-pg'

interface StartBody {
  email?: string
  fullName?: string
  phone?: string
}

function sanitize(input: string, maxLen = 100): string {
  return input
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/<[^>]*>/g, '')
    .trim()
    .slice(0, maxLen)
}

export async function POST(req: NextRequest) {
  // ---- Rate limit (5 requests / 60s per IP) ---------------------------------
  const ip = getClientIp(req)
  const rl = rateLimit(ip, 'auth:signup-start', { windowMs: 60_000, max: 5 })
  if (!rl.ok) return rateLimitResponse(rl.resetAt)

  let body: StartBody
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  const emailStr = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  const fullNameStr = typeof body.fullName === 'string' ? body.fullName.trim() : ''
  const phoneStr = typeof body.phone === 'string' ? body.phone.trim() : ''

  // ---- Validation -----------------------------------------------------------
  if (fullNameStr.length > 100) {
    return NextResponse.json({ error: 'Full name is too long (max 100 characters).' }, { status: 400 })
  }
  if (emailStr.length > 254) {
    return NextResponse.json({ error: 'Email is too long.' }, { status: 400 })
  }
  if (fullNameStr.length < 2) {
    return NextResponse.json({ error: 'Please provide your full name.' }, { status: 400 })
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailStr)) {
    return NextResponse.json({ error: 'Invalid email.' }, { status: 400 })
  }

  // ---- Check email isn't already registered ---------------------------------
  // SECURITY: same generic message regardless of whether email is taken.
  //
  // DEV ESCAPE HATCH: when OTP_PREVIEW=true AND OTP_PREVIEW_ALLOW_REUSED=1,
  // we skip the duplicate check so you can re-register an existing email
  // while testing without manually deleting the old profile row first.
  // Both flags must be set; OTP_PREVIEW alone is not enough.
  //
  // 2026-10-07: switched to pg-direct (utils/db-pg.ts) because the
  // Supabase REST admin client returned "Invalid API key" — the
  // SUPABASE_SERVICE_ROLE_KEY in Vercel had been rotated in the Supabase
  // dashboard. The pg connection bypasses the API entirely.
  let skipExistingCheck = false
  if (process.env.OTP_PREVIEW === 'true' && process.env.OTP_PREVIEW_ALLOW_REUSED === '1') {
    skipExistingCheck = true
    console.warn(`[signup/start] DEV: re-registering existing email ${emailStr}`)
  }

  if (!skipExistingCheck) {
    const existing = await findProfileIdByEmail(emailStr)
    if (existing.data) {
      // Don't leak that the email exists. Same generic 400 as other failures.
      console.warn(`[signup/start] email already registered: ${emailStr}`)
      return NextResponse.json(
        { error: 'Could not start signup. If you already have an account, please sign in.' },
        { status: 400 },
      )
    }
  }

  // ---- Create pending signup (no password here) -----------------------------
  //
  // 2026-10-16: previously this stored password_plain + password_hash in
  // pending_payload. A drop-off after OTP verify then left a credential
  // row in email_verifications for 15 minutes. Now password only flows
  // through the final /complete step, so even a half-completed signup
  // leaves only { email, full_name, phone } in the DB.
  const cleanFullName = sanitize(fullNameStr, 100)
  const cleanPhone = phoneStr ? sanitize(phoneStr, 20) : ''

  const payload: PendingSignupPayload = {
    email: emailStr,
    full_name: cleanFullName,
    phone: cleanPhone || null,
  }

  const userAgent = req.headers.get('user-agent') ?? null
  const result = await issueOtpForSignup(payload, { ip, userAgent })
  if (!result.ok || !result.signupId) {
    console.error('[signup/start] issueOtp failed:', result.error)
    return NextResponse.json(
      { error: 'Could not send verification code. Please try again.' },
      { status: 500 },
    )
  }

  // For dev mode (OTP_PREVIEW=true), the code is returned in the response so
  // you can complete the flow without checking an inbox. In production this
  // is undefined — the code only exists in the user's email.
  //
  // Also forwarded to a `__devCode` field so it's obviously not a production
  // surface. The UI logs it to console (dev only).
  const responseBody: Record<string, unknown> = {
    signupId: result.signupId,
    email: emailStr,
    expiresInSeconds: 15 * 60,
  }
  if (result.previewCode) {
    responseBody.__devCode = result.previewCode
  }

  // 2026-10-20: send the email AFTER responding, not before.
  //
  // Measured breakdown of this route:
  //   findProfileIdByEmail           ~78ms
  //   consumeUnverifiedCodesForEmail ~62ms
  //   bcrypt.hash(code, 10)          ~163ms
  //   insertEmailVerification        ~71ms
  //   sendEmail (Resend HTTP)        ~2000ms  ← 85% of the request
  //
  // The database work is ~374ms; the Resend round trip is the rest. Resend is
  // an external service we do not control, and it already queues the message
  // on its side — awaiting the response here only made the user stare at a
  // spinner for two seconds with nothing to gain.
  //
  // `waitUntil` keeps the function alive until the promise settles, so the
  // email is still delivered reliably on serverless. The OTP row is already
  // committed to the database at this point, so a delivery failure is
  // recoverable via /signup/resend-otp.
  const otpCode = result.otpCode
  if (otpCode && !result.previewCode) {
    const sendPromise = deliverOtpEmail(emailStr, otpCode)
    const waitUntil = (req as NextRequest & { waitUntil?: (p: Promise<unknown>) => void }).waitUntil
    if (typeof waitUntil === 'function') {
      waitUntil(sendPromise)
    } else {
      // No waitUntil available (local dev / older runtimes) — fire and forget.
      void sendPromise
    }
  }

  return NextResponse.json(responseBody)
}

/**
 * Deliver the OTP email. Split out of the route so the HTTP response can be
 * returned before the provider round trip. The code row is already persisted
 * by the time this runs, so a failure here is recoverable via resend.
 */
async function deliverOtpEmail(email: string, code: string): Promise<void> {
  try {
    const { buildOtpEmail, sendEmail } = await import('@/utils/email')
    const message = buildOtpEmail({ code })
    const sent = await sendEmail({
      to: email,
      subject: message.subject,
      html: message.html,
      text: message.text,
    })
    if (!sent.ok) {
      console.error(`[signup/start] background email send failed for ${email}: ${sent.error}`)
    }
  } catch (e) {
    console.error('[signup/start] background email threw:', (e as Error).message)
  }
}
