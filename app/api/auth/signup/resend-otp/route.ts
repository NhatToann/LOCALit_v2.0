/**
 * Re-issue a fresh 6-digit verification code for an in-progress signup.
 *
 * POST /api/auth/signup/resend-otp
 * Body: { signupId }
 *
 * The previous code is invalidated (consumed_at = now()) and a new one is
 * sent. Used when the user didn't get the first code or it expired.
 *
 * SECURITY:
 *   - 3 requests / 60s per IP rate limit.
 *   - Doesn't leak whether the signup exists: 404 for both unknown signupIds
 *     and already-completed ones (treated as "not found").
 */
import { NextResponse, type NextRequest } from 'next/server'
import { rateLimit, getClientIp, rateLimitResponse } from '@/utils/rate-limit'
import { issueOtpForSignup } from '@/utils/otp'
import { selectEmailVerification } from '@/utils/db-pg'

interface ResendBody {
  signupId?: string
}

export async function POST(req: NextRequest) {
  const ip = getClientIp(req)
  const rl = rateLimit(ip, 'auth:signup-resend', { windowMs: 60_000, max: 3 })
  if (!rl.ok) return rateLimitResponse(rl.resetAt)

  let body: ResendBody
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  const { signupId } = body

  if (!signupId || typeof signupId !== 'string') {
    return NextResponse.json({ error: 'Missing signupId.' }, { status: 400 })
  }

  // pg-direct (immune to SUPABASE_SERVICE_ROLE_KEY rotation; see
  // utils/otp-pg.ts header comment for why we bypass the REST admin).
  const sel = await selectEmailVerification(signupId)
  if (sel.error || !sel.data) {
    // Don't leak whether the signup exists.
    return NextResponse.json({ error: 'No active signup to resend for.' }, { status: 404 })
  }
  const data = sel.data
  if (data.consumed_at) {
    return NextResponse.json({ error: 'This signup was already completed.' }, { status: 410 })
  }

  // Issue a fresh code. The payload is the same (already-stored), so we can
  // re-issue without asking the user to retype anything.
  const result = await issueOtpForSignup(data.pending_payload as any, { ip, userAgent: req.headers.get('user-agent') ?? null })
  if (!result.ok) {
    console.error('[signup/resend-otp] issueOtp failed:', result.error)
    return NextResponse.json({ error: 'Could not resend code.' }, { status: 500 })
  }

  const responseBody: Record<string, unknown> = { ok: true, signupId: result.signupId }
  if (result.previewCode) responseBody.__devCode = result.previewCode
  return NextResponse.json(responseBody)
}
