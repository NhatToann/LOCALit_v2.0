import { NextResponse, type NextRequest } from 'next/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { consumeOtp } from '@/utils/otp'

interface VerifyOtpBody {
  userId?: string
  code?: string
  /** Optional: just for nicer UX / logging. Not used for lookup. */
  email?: string
}

/**
 * Verify the 6-digit code the user received in their inbox. On success:
 *   1. Mark auth.users.email_confirmed_at via the admin API.
 *   2. Upsert a public.profiles row defensively (in case the trigger dropped).
 *
 * The client then calls supabase.auth.signInWithPassword() to establish a
 * session and redirects to /tourist/dashboard or /buddy/dashboard.
 *
 * Security:
 *   - 5 wrong attempts invalidate the code (forced resend).
 *   - Codes expire after 15 minutes.
 *   - bcrypt-hashed at rest.
 *
 * Trust:
 *   - userId comes from the /register page which received it from the
 *     signup-admin response. Anyone hitting this route can technically guess
 *     or sniff a UUID, but without a valid code they get nothing. RLS on
 *     email_verifications prevents cross-user lookups anyway.
 */
export async function POST(req: NextRequest) {
  let body: VerifyOtpBody
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  const { userId, code } = body

  if (!userId || typeof userId !== 'string') {
    return NextResponse.json({ error: 'Missing userId.' }, { status: 400 })
  }
  if (!code || typeof code !== 'string' || !/^\d{6}$/.test(code)) {
    return NextResponse.json({ error: 'Code must be 6 digits.' }, { status: 400 })
  }

  const admin = createAdminClient()

  const { data: lookup, error: lookupErr } = await admin.auth.admin.getUserById(userId)
  if (lookupErr || !lookup?.user) {
    return NextResponse.json(
      { error: lookupErr?.message ?? 'User not found.' },
      { status: 404 },
    )
  }
  const target = lookup.user

  const result = await consumeOtp(target.id, code)
  if (!result.ok) {
    const status = result.reason === 'no_code' || result.reason === 'expired' || result.reason === 'too_many_attempts' ? 410 : 400
    return NextResponse.json({ error: result.error, reason: result.reason }, { status })
  }

  // Confirm the user's email.
  if (!target.email_confirmed_at) {
    const { error: confirmErr } = await admin.auth.admin.updateUserById(target.id, {
      email_confirm: true,
    })
    if (confirmErr) {
      return NextResponse.json(
        { error: `Code verified, but confirming email failed: ${confirmErr.message}` },
        { status: 500 },
      )
    }
  }

  // Defensive profiles upsert so the user has a profile row even if the
  // on_auth_user_created trigger dropped.
  try {
    await admin
      .from('profiles')
      .upsert(
        {
          id: target.id,
          email: target.email ?? '',
          role: (target.user_metadata?.role as 'tourist' | 'buddy' | undefined) ?? 'tourist',
          full_name: (target.user_metadata?.full_name as string | undefined) ?? 'New user',
        },
        { onConflict: 'id', ignoreDuplicates: true },
      )
  } catch (e) {
    console.warn('[verify-otp] profiles upsert warning:', (e as Error).message)
  }

  return NextResponse.json({ ok: true, userId: target.id })
}