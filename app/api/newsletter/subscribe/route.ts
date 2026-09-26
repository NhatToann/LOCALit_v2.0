import { NextRequest, NextResponse } from 'next/server'
import { rateLimit, getClientIp, rateLimitResponse } from '@/utils/rate-limit'

/**
 * Newsletter subscribe — accepts either JSON or form-encoded.
 * 
 * Defenses:
 *   - Per-IP rate limit (3 req / 60s) to prevent abuse.
 *   - Origin/Referer same-origin check (CSRF).
 *   - Email is validated and normalized.
 */
export async function POST(req: NextRequest) {
  // ---- Rate limit ------------------------------------------------------------
  const ip = getClientIp(req)
  const rl = rateLimit(ip, 'newsletter:subscribe', { windowMs: 60_000, max: 3 })
  if (!rl.ok) return rateLimitResponse(rl.resetAt)

  // ---- CSRF protection (same-origin) ----------------------------------------
  const origin = req.headers.get('origin') ?? ''
  const referer = req.headers.get('referer') ?? ''
  const host = req.headers.get('host') ?? ''
  // Allow if origin matches host (prod), or referer matches host. allow empty
  // origin only for direct POSTs from same-site forms.
  const sameOrigin =
    (origin && new URL(origin).host === host) ||
    (referer && new URL(referer).host === host)
  if (!sameOrigin) {
    return NextResponse.json({ error: 'Forbidden.' }, { status: 403 })
  }

  // ---- Parse body ----------------------------------------------------------
  let email: string | null = null
  const contentType = req.headers.get('content-type') ?? ''

  if (contentType.includes('application/json')) {
    try {
      const body = await req.json()
      email = typeof body?.email === 'string' ? body.email : null
    } catch {
      return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 })
    }
  } else {
    // Form-encoded (the footer form uses this).
    try {
      const form = await req.formData()
      const raw = form.get('email')
      email = typeof raw === 'string' ? raw : null
    } catch {
      return NextResponse.json({ error: 'Could not parse form.' }, { status: 400 })
    }
  }

  if (!email) {
    return NextResponse.json({ error: 'Email is required' }, { status: 400 })
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!emailRegex.test(email)) {
    return NextResponse.json({ error: 'Invalid email format' }, { status: 400 })
  }

  const normalized = email.trim().toLowerCase().slice(0, 254)
  console.log(`[newsletter] new subscription: ${normalized}`)

  // For form-encoded posts, redirect back; for JSON posts, return JSON.
  if (contentType.includes('application/json')) {
    return NextResponse.json({ ok: true })
  }
  return NextResponse.redirect(new URL('/?subscribed=1', req.url), { status: 303 })
}
