import { NextResponse, type NextRequest } from 'next/server'
import { createClient as createServerClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { rateLimit, getClientIp, rateLimitResponse } from '@/utils/rate-limit'

type Role = 'tourist' | 'buddy'

interface CreateProfileBody {
  userId?: string
  role?: Role
  payload?: Record<string, unknown>
  /** DEPRECATED: autoConfirm used to flip email_confirm on the admin API.
   *  This was a footgun — any caller could confirm arbitrary users inside a
   *  15-minute window. We now require a one-time signup token instead. */
  autoConfirm?: boolean
  /** A one-time token issued by /api/auth/signup that authorises the call to
   *  mark a specific user as confirmed. Issued only when Supabase refuses to
   *  auto-confirm a fresh user. */
  signupToken?: string
}

/** In-memory OTP-style store for signup tokens. Mirrors utils/otp.ts but without
 *  the email channel — these tokens are produced and consumed in the same
 *  request lifecycle so we don't need persistence. */
const SIGNUP_TOKENS = new Map<string, { userId: string; expiresAt: number }>()

/** Cheap random token. Good enough for a single-request correlation. */
function genToken(): string {
  return (
    Math.random().toString(36).slice(2, 10) +
    Math.random().toString(36).slice(2, 10) +
    Date.now().toString(36)
  )
}

/** Issue a token that authorises the caller's first sign-in. Returned from
 *  /api/auth/signup when Supabase blocks confirm-on-create (e.g. when
 *  "Confirm email" is enabled at the project level). */
export function issueSignupToken(userId: string): string {
  const token = genToken()
  SIGNUP_TOKENS.set(token, { userId, expiresAt: Date.now() + 5 * 60 * 1000 })
  return token
}

/** Atomically consume a token and return the associated userId if valid. */
function consumeSignupToken(token: string, expectedUserId: string): boolean {
  const entry = SIGNUP_TOKENS.get(token)
  if (!entry) return false
  SIGNUP_TOKENS.delete(token) // one-shot
  if (Date.now() > entry.expiresAt) return false
  if (entry.userId !== expectedUserId) return false
  return true
}

/** Strip control chars and HTML tags. Server-side last line of defense. */
function sanitize(input: unknown, maxLen = 100): string {
  if (typeof input !== 'string') return ''
  return input
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/<[^>]*>/g, '')
    .trim()
    .slice(0, maxLen)
}

/**
 * Server-side handler that completes the sign-up flow:
 *   1. Possibly marks the user's email as confirmed (only with a valid signup
 *      token, NOT the deprecated autoConfirm flag).
 *   2. Upserts the role-specific row (tourists or buddies).
 *
 * Trust model:
 *   - The user must already be authenticated (cookie session) OR a valid
 *     signup token issued by /api/auth/signup must be presented.
 *   - The signup token path is the legacy "right-after-signup, no session
 *     yet" flow. It's narrow: 5-minute TTL, single-use, scoped to a userId.
 *   - Rate-limited per IP.
 */
export async function POST(req: NextRequest) {
  // ---- Rate limit (10 req / 60s per IP) --------------------------------------
  const ip = getClientIp(req)
  const rl = rateLimit(ip, 'auth:create-profile', { windowMs: 60_000, max: 10 })
  if (!rl.ok) return rateLimitResponse(rl.resetAt)

  // ---- Parse + validate body ------------------------------------------------
  let body: CreateProfileBody
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  const { userId, role, payload, signupToken } = body

  if (!userId || typeof userId !== 'string') {
    return NextResponse.json({ error: 'Missing userId.' }, { status: 400 })
  }
  if (role !== 'tourist' && role !== 'buddy') {
    return NextResponse.json({ error: 'Invalid role.' }, { status: 400 })
  }
  if (!payload || typeof payload !== 'object') {
    return NextResponse.json({ error: 'Missing payload.' }, { status: 400 })
  }

  // ---- Verify caller identity -------------------------------------------------
  // Two acceptable paths:
  //   A) Cookie-bound session whose userId matches the request body.
  //   B) A valid one-shot signup token issued for that userId by /api/auth/signup.
  const ssr = await createServerClient()
  const { data: cookieUserData } = await ssr.auth.getUser()
  const cookieUser = cookieUserData?.user ?? null

  let authorised = false

  if (cookieUser?.id) {
    if (cookieUser.id === userId) {
      authorised = true
    } else {
      return NextResponse.json(
        { error: 'Forbidden: userId does not match authenticated user.' },
        { status: 403 },
      )
    }
  } else if (signupToken && typeof signupToken === 'string') {
    if (consumeSignupToken(signupToken, userId)) {
      authorised = true
    } else {
      return NextResponse.json(
        { error: 'Invalid or expired signup token.' },
        { status: 401 },
      )
    }
  }

  if (!authorised) {
    return NextResponse.json(
      { error: 'Unauthorized: no active session and no valid signup token.' },
      { status: 401 },
    )
  }

  const admin = createAdminClient()

  // ---- Defensive profiles upsert ---------------------------------------------
  try {
    const { error: profileErr } = await admin
      .from('profiles')
      .upsert(
        {
          id: userId,
          email: '',
          role,
          full_name: typeof payload.full_name === 'string'
            ? sanitize(payload.full_name, 100)
            : 'New user',
        },
        { onConflict: 'id', ignoreDuplicates: true },
      )
    if (profileErr && profileErr.code !== '23505') {
      console.warn('[create-profile] profiles upsert warning:', profileErr.message)
    }
  } catch (e) {
    console.warn('[create-profile] profiles upsert threw:', (e as Error).message)
  }

  // ---- Optional email confirm via signup token path --------------------------
  // Only confirm if the caller authorised via signup token (path B). Cookie
  // session users (path A) would already have a confirmed email because
  // Supabase only establishes sessions for confirmed users.
  if (!cookieUser?.id && signupToken) {
    try {
      const { data: target } = await admin.auth.admin.getUserById(userId)
      if (target?.user && !target.user.email_confirmed_at) {
        const ageMs = Date.now() - new Date(target.user.created_at).getTime()
        // Only confirm if the user was just created (within 15 min) — prevents
        // an attacker who found an old signup token from re-confirming users.
        if (ageMs <= 15 * 60 * 1000) {
          await admin.auth.admin.updateUserById(userId, { email_confirm: true })
        }
      }
    } catch (e) {
      console.warn('[create-profile] confirm attempt warning:', (e as Error).message)
    }
  }

  // ---- Upsert role-specific row (sanitized) ----------------------------------
  const cleanRow: Record<string, unknown> = { id: userId }
  for (const [k, v] of Object.entries(payload)) {
    if (k === 'id') continue
    if (typeof v === 'string') {
      cleanRow[k] = sanitize(v, 500)
    } else if (Array.isArray(v)) {
      // Only keep arrays of short strings — drop anything else.
      cleanRow[k] = v
        .filter(x => typeof x === 'string')
        .map(x => sanitize(x, 64))
        .slice(0, 32)
    } else {
      cleanRow[k] = v
    }
  }
  cleanRow.updated_at = new Date().toISOString()

  const table = role === 'tourist' ? 'tourists' : 'buddies'
  const { error: upsertErr } = await admin.from(table).upsert(cleanRow, { onConflict: 'id' })

  if (upsertErr) {
    return NextResponse.json(
      { error: `Could not save ${role} profile: ${upsertErr.message}` },
      { status: 500 },
    )
  }

  return NextResponse.json({ ok: true })
}
