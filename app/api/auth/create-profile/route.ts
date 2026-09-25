import { NextResponse, type NextRequest } from 'next/server'
import { createClient as createServerClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'

type Role = 'tourist' | 'buddy'

interface CreateProfileBody {
  userId?: string
  role?: Role
  payload?: Record<string, unknown>
  /** When true, the server will mark the user's email as confirmed via the
   *  admin API before writing the role row. Use this only on the signup path
   *  so the user can immediately sign in without a confirmation email. */
  autoConfirm?: boolean
}

/**
 * Server-side handler that completes the sign-up flow:
 *   1. Optionally auto-confirms the user's email via the admin API (bypasses
 *      the "Confirm email" gate that would otherwise block the first sign-in).
 *   2. Upserts the role-specific row (tourists or buddies) using the
 *      service-role key, which bypasses RLS — so it works even when the user's
 *      session is null (unconfirmed-email state).
 *
 * Trust model:
 *   - Called only from app/register/page.tsx immediately after a successful
 *     signUp. The caller is either authenticated (cookie session) OR not
 *     (signUp returned no session because email confirm is ON).
 *   - When autoConfirm is requested, the email must have been created in the
 *     last 15 minutes (prevents abuse of the admin confirm path).
 *   - When the caller IS authenticated, the SSR client ensures user.id matches
 *     the body userId.
 */
export async function POST(req: NextRequest) {
  let body: CreateProfileBody
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  const { userId, role, payload, autoConfirm } = body

  if (!userId || typeof userId !== 'string') {
    return NextResponse.json({ error: 'Missing userId.' }, { status: 400 })
  }
  if (role !== 'tourist' && role !== 'buddy') {
    return NextResponse.json({ error: 'Invalid role.' }, { status: 400 })
  }
  if (!payload || typeof payload !== 'object') {
    return NextResponse.json({ error: 'Missing payload.' }, { status: 400 })
  }

  // ---- Verify caller identity -----------------------------------------------
  // Try cookie-bound SSR session first. If there's no session, accept autoConfirm
  // requests whose userId was created within the last 15 minutes (this is the
  // "right-after-signUp, no session yet" path).
  const ssr = await createServerClient()
  const { data: cookieUserData } = await ssr.auth.getUser()
  const cookieUser = cookieUserData?.user ?? null

  if (cookieUser?.id) {
    if (cookieUser.id !== userId) {
      return NextResponse.json(
        { error: 'Forbidden: userId does not match authenticated user.' },
        { status: 403 },
      )
    }
  } else if (!autoConfirm) {
    return NextResponse.json(
      { error: 'Unauthorized: no active session.' },
      { status: 401 },
    )
  }

  const admin = createAdminClient()

  // ---- Optional: confirm the user's email -----------------------------------
  if (autoConfirm) {
    const { data: target, error: lookupErr } = await admin.auth.admin.getUserById(userId)
    if (lookupErr || !target?.user) {
      return NextResponse.json(
        { error: `User not found: ${lookupErr?.message ?? 'unknown'}` },
        { status: 404 },
      )
    }
    const createdAt = new Date(target.user.created_at).getTime()
    const ageMs = Date.now() - createdAt
    if (Number.isNaN(createdAt) || ageMs > 15 * 60 * 1000) {
      return NextResponse.json(
        { error: 'Auto-confirm window has expired. Please sign in normally.' },
        { status: 410 },
      )
    }
    if (!target.user.email_confirmed_at) {
      const { error: confirmErr } = await admin.auth.admin.updateUserById(userId, {
        email_confirm: true,
      })
      if (confirmErr) {
        return NextResponse.json(
          { error: `Could not confirm email: ${confirmErr.message}` },
          { status: 500 },
        )
      }
    }
  }

  // ---- Upsert role-specific row ---------------------------------------------
  const table = role === 'tourist' ? 'tourists' : 'buddies'
  const row = { id: userId, ...payload, updated_at: new Date().toISOString() }

  const { error: upsertErr } = await admin
    .from(table)
    .upsert(row, { onConflict: 'id' })

  if (upsertErr) {
    return NextResponse.json(
      { error: `Could not save ${role} profile: ${upsertErr.message}` },
      { status: 500 },
    )
  }

  return NextResponse.json({ ok: true })
}
