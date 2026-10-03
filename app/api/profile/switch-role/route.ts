/**
 * POST /api/profile/switch-role
 *
 * Body: { role: 'tourist' | 'buddy' }
 *
 * Switches the session user's profiles.role and ensures the matching
 * row exists in either public.buddies or public.tourists. Used by the
 * "Switch account role" UI on /profile.
 *
 * Defenses:
 *   - Requires a session (anon callers get 401).
 *   - Per-IP rate limit (5/min) via utils/rate-limit.ts.
 *   - Same-origin check on Origin/Referer (CSRF).
 *   - Body length cap and explicit role whitelist.
 *   - Generic 400 message on failure (does not leak whether the
 *     role row already existed).
 *
 * Side-effects (run in this order):
 *   1. UPDATE profiles.role (uses auth.uid()).
 *   2. If switching FROM tourist TO buddy: ensure public.buddies row
 *      exists (INSERT with defaults, idempotent via .maybeSingle() check).
 *      Same the other way.
 */
import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { rateLimit, getClientIp, rateLimitResponse } from '@/utils/rate-limit'

interface Body {
  role?: string
}

const ALLOWED_ROLES = new Set(['tourist', 'buddy'])

export async function POST(req: NextRequest) {
  // ---- Rate limit (5 requests / 60s per IP) ---------------------------------
  const ip = getClientIp(req)
  const rl = rateLimit(ip, 'profile:switch-role', { windowMs: 60_000, max: 5 })
  if (!rl.ok) return rateLimitResponse(rl.resetAt)

  // ---- Same-origin CSRF check (matches utils/safe-handler pattern) -----------
  const origin = req.headers.get('origin')
  const referer = req.headers.get('referer')
  const host = req.headers.get('host')
  if (origin) {
    try {
      const o = new URL(origin)
      if (o.host !== host) {
        return NextResponse.json({ error: 'Cross-origin request blocked.' }, { status: 403 })
      }
    } catch {
      return NextResponse.json({ error: 'Invalid origin.' }, { status: 403 })
    }
  } else if (referer) {
    try {
      const r = new URL(referer)
      if (r.host !== host) {
        return NextResponse.json({ error: 'Cross-origin request blocked.' }, { status: 403 })
      }
    } catch {
      return NextResponse.json({ error: 'Invalid referer.' }, { status: 403 })
    }
  }

  // ---- Body parse + size cap -------------------------------------------------
  const raw = await req.text()
  if (raw.length > 1024) {
    return NextResponse.json({ error: 'Payload too large.' }, { status: 413 })
  }
  let body: Body
  try {
    body = JSON.parse(raw) as Body
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }
  const role = typeof body.role === 'string' ? body.role.trim().toLowerCase() : ''
  if (!ALLOWED_ROLES.has(role)) {
    return NextResponse.json({ error: 'Invalid role.' }, { status: 400 })
  }

  // ---- Session check ---------------------------------------------------------
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Sign in to switch your account role.' }, { status: 401 })
  }

  // ---- UPDATE profiles.role --------------------------------------------------
  const { error: roleErr } = await supabase
    .from('profiles')
    .update({ role })
    .eq('id', user.id)
  if (roleErr) {
    return NextResponse.json({ error: 'Could not update role.' }, { status: 400 })
  }

  // ---- Ensure the role-specific row exists (idempotent) --------------------
  const table = role === 'buddy' ? 'buddies' : 'tourists'
  const { data: existing } = await supabase
    .from(table)
    .select('id')
    .eq('id', user.id)
    .maybeSingle()
  if (!existing) {
    if (role === 'buddy') {
      const { error: insErr } = await supabase.from('buddies').insert({
        id: user.id,
        location_city: 'Da Nang',
        languages: ['English'],
        specialties: [],
        hourly_rate: 15,
        is_available: true,
        favorite_places: [],
        trips_completed: 0,
        rating_avg: 0,
        bio: null,
      } as never)
      if (insErr) {
        return NextResponse.json(
          { error: 'Role updated but buddy profile could not be created.' },
          { status: 400 },
        )
      }
    } else {
      const { error: insErr } = await supabase.from('tourists').insert({
        id: user.id,
        nationality: '',
        date_of_birth: null,
        travel_style: 'solo',
        interests: [],
        languages: ['English'],
        budget_range: '50-100',
        destination: 'Da Nang',
      } as never)
      if (insErr) {
        return NextResponse.json(
          { error: 'Role updated but tourist profile could not be created.' },
          { status: 400 },
        )
      }
    }
  }

  return NextResponse.json({ ok: true, role })
}
