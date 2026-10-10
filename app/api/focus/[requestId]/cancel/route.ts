import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { rateLimit, getClientIp, rateLimitResponse } from '@/utils/rate-limit'

// Requester cancels a still-pending focus request. 410 if it has
// already been accepted/expired/handled, 403 if the caller is not
// the requester.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ requestId: string }> },
) {
  try {
    const ip = getClientIp(req)
    const rl = rateLimit(`focus.cancel.${ip}`, 'focus.cancel', {
      windowMs: 60_000,
      max: 20,
    })
    if (!rl.ok) return rateLimitResponse(rl.resetAt)

    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }

    const { requestId } = await params

    const { data: focusReq, error: rErr } = await supabase
      .from('focus_requests')
      .select('*')
      .eq('id', requestId)
      .maybeSingle()
    if (rErr) {
      return NextResponse.json({ error: 'lookup_failed' }, { status: 500 })
    }
    if (!focusReq) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 })
    }
    if (focusReq.requester_id !== user.id) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }
    if (focusReq.status !== 'pending') {
      return NextResponse.json(
        { ok: true, status: focusReq.status, already_handled: true },
      )
    }

    const { error: uErr } = await supabase
      .from('focus_requests')
      .update({ status: 'cancelled' })
      .eq('id', focusReq.id)
    if (uErr) {
      return NextResponse.json(
        { error: 'update_failed', message: uErr.message },
        { status: 500 },
      )
    }

    return NextResponse.json({ ok: true, status: 'cancelled' })
  } catch (err) {
    return NextResponse.json(
      { error: 'server_error', message: (err as Error).message },
      { status: 500 },
    )
  }
}
