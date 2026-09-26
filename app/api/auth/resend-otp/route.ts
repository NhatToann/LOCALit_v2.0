import { NextResponse, type NextRequest } from 'next/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { issueOtp } from '@/utils/otp'

interface ResendOtpBody {
  userId?: string
}

/**
 * Re-issue a fresh 6-digit verification code for the given user. The previous
 * code is invalidated as part of issueOtp().
 *
 * Requires userId — the client already has it from the signup response.
 *
 * Rate-limiting: in production this should be guarded by IP-based throttling
 * (e.g. Upstash or Vercel KV). For now, the flow itself is naturally limited
 * because issueOtp invalidates prior codes — only the most recent code is
 * usable.
 */
export async function POST(req: NextRequest) {
  let body: ResendOtpBody
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  const { userId } = body

  if (!userId || typeof userId !== 'string') {
    return NextResponse.json({ error: 'Missing userId.' }, { status: 400 })
  }

  const admin = createAdminClient()

  const { data: target, error: lookupErr } = await admin.auth.admin.getUserById(userId)
  if (lookupErr || !target?.user) {
    return NextResponse.json(
      { error: lookupErr?.message ?? 'User not found.' },
      { status: 404 },
    )
  }
  if (target.user.email_confirmed_at) {
    return NextResponse.json(
      { error: 'Email is already verified. Please sign in.' },
      { status: 409 },
    )
  }
  if (!target.user.email) {
    return NextResponse.json({ error: 'User has no email on file.' }, { status: 400 })
  }

  const result = await issueOtp(target.user.id, target.user.email)
  if (!result.ok) {
    return NextResponse.json({ error: result.error ?? 'Could not send code.' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}