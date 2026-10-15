/**
 * GET /api/connections/check?target=<userId>
 *
 * Returns the caller's connection state with `target` in one round-trip.
 * Used by /chat, /itinerary/[id], and the buddy/tourist profile pages to
 * decide whether to gate the UI (lock banner) or the API (write gates).
 *
 * Response:
 *   {
 *     hasConnection: boolean,
 *     status: 'pending' | 'accepted' | 'declined' | null,
 *     direction: 'i_sent' | 'they_sent' | null,
 *     connectionId: string | null,
 *     durationDays: number | null,
 *     expiresAt: string | null,
 *     daysRemaining: number | null,
 *     isLocked: boolean,
 *   }
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

    const url = new URL(req.url)
    const target = url.searchParams.get('target')
    if (!target || !UUID_RE.test(target)) {
      return NextResponse.json({ error: 'invalid_target' }, { status: 400 })
    }
    if (target === user.id) {
      return NextResponse.json(
        {
          hasConnection: false,
          status: null,
          direction: null,
          connectionId: null,
          durationDays: null,
          expiresAt: null,
          daysRemaining: null,
          isLocked: false,
        },
        { status: 200 },
      )
    }

    const { data, error } = await supabase
      .from('connections')
      .select(
        'id, requester_id, recipient_id, status, duration_days, accepted_at, expires_at, locked_at',
      )
      .or(
        `and(requester_id.eq.${user.id},recipient_id.eq.${target}),` +
          `and(requester_id.eq.${target},recipient_id.eq.${user.id})`,
      )
      .limit(1)
      .maybeSingle()
    if (error) {
      return NextResponse.json(
        { error: 'query_failed', message: error.message },
        { status: 500 },
      )
    }
    if (!data) {
      return NextResponse.json({
        hasConnection: false,
        status: null,
        direction: null,
        connectionId: null,
        durationDays: null,
        expiresAt: null,
        daysRemaining: null,
        isLocked: false,
      })
    }

    const direction = data.requester_id === user.id ? 'i_sent' : 'they_sent'
    const expiresAt = data.expires_at ? new Date(data.expires_at) : null
    const isLocked =
      data.status === 'accepted' &&
      (data.locked_at != null || (expiresAt !== null && expiresAt.getTime() < Date.now()))
    const daysRemaining =
      data.status === 'accepted' && expiresAt
        ? Math.max(-999, Math.ceil((expiresAt.getTime() - Date.now()) / 86_400_000))
        : null

    return NextResponse.json({
      hasConnection: true,
      status: data.status,
      direction,
      connectionId: data.id,
      durationDays: data.duration_days,
      expiresAt: data.expires_at,
      daysRemaining,
      isLocked,
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'unknown'
    return NextResponse.json({ error: 'server_error', message }, { status: 500 })
  }
}
