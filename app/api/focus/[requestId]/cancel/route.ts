import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { rateLimit, getClientIp, rateLimitResponse } from '@/utils/rate-limit'

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ requestId: string }> },
) {
  try {
    const ip = getClientIp(_req)
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

    const { data: request, error: rErr } = await supabase
      .from('focus_requests')
      .select('*')
      .eq('id', requestId)
      .maybeSingle()
    if (rErr) {
      return NextResponse.json({ error: 'lookup_failed' }, { status: 500 })
    }
    if (!request) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 })
    }
    if (request.requester_id !== user.id) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }
    if (request.status !== 'pending') {
      return NextResponse.json({ ok: true, status: request.status })
    }

    const { error: uErr } = await supabase
      .from('focus_requests')
      .update({ status: 'cancelled' })
      .eq('id', request.id)
    if (uErr) {
      return NextResponse.json({ error: 'update_failed' }, { status: 500 })
    }

    return NextResponse.json({ ok: true, status: 'cancelled' })
  } catch (err) {
    return NextResponse.json(
      { error: 'server_error', message: (err as Error).message },
      { status: 500 },
    )
  }
}
