import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { rateLimit, getClientIp, rateLimitResponse } from '@/utils/rate-limit'
import { z } from 'zod'

const BodySchema = z.object({
  action: z.enum(['accept', 'decline']),
})

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ requestId: string }> },
) {
  try {
    const ip = getClientIp(req)
    const rl = rateLimit(`focus.respond.${ip}`, 'focus.respond', {
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

    let body: unknown
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: 'invalid_body' }, { status: 400 })
    }
    const parsed = BodySchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'invalid_body', details: parsed.error.flatten() },
        { status: 400 },
      )
    }
    const { action } = parsed.data

    // Load the request
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
    if (request.recipient_id !== user.id) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }
    if (request.status !== 'pending') {
      return NextResponse.json(
        { error: 'already_responded', status: request.status },
        { status: 409 },
      )
    }
    if (new Date(request.expires_at).getTime() < Date.now()) {
      // Mark as expired if it slipped through
      await supabase
        .from('focus_requests')
        .update({ status: 'expired' })
        .eq('id', request.id)
      return NextResponse.json({ error: 'expired' }, { status: 410 })
    }

    if (action === 'decline') {
      const { error: uErr } = await supabase
        .from('focus_requests')
        .update({ status: 'declined' })
        .eq('id', request.id)
      if (uErr) {
        return NextResponse.json({ error: 'update_failed' }, { status: 500 })
      }
      // Best-effort notification to the requester
      try {
        const { data: recipientProfile } = await supabase
          .from('safe_profiles')
          .select('full_name')
          .eq('id', user.id)
          .maybeSingle()
        const recipientName = recipientProfile?.full_name ?? 'Your buddy'
        await supabase.from('notifications').insert({
          user_id: request.requester_id,
          type: 'focus_declined',
          title: `${recipientName} declined your Focus request`,
          body: 'Send a new request whenever you are ready.',
          link: `/chat?conv=${request.conversation_id ?? ''}`,
          actor_id: user.id,
          actor_name: recipientName,
        })
      } catch {
        /* ignore */
      }
      return NextResponse.json({ ok: true, status: 'declined' })
    }

    // action === 'accept' → create a focus_sessions row
    // Ensure neither party already has an active session
    const { data: aActive } = await supabase
      .from('focus_sessions')
      .select('id')
      .or(`user_a_id.eq.${user.id},user_b_id.eq.${user.id}`)
      .is('ended_at', null)
      .maybeSingle()
    if (aActive) {
      return NextResponse.json(
        { error: 'recipient_in_active_session', session_id: aActive.id },
        { status: 409 },
      )
    }
    const { data: bActive } = await supabase
      .from('focus_sessions')
      .select('id')
      .or(`user_a_id.eq.${request.requester_id},user_b_id.eq.${request.requester_id}`)
      .is('ended_at', null)
      .maybeSingle()
    if (bActive) {
      return NextResponse.json({ error: 'requester_in_active_session' }, { status: 409 })
    }

    const { data: session, error: sErr } = await supabase
      .from('focus_sessions')
      .insert({
        user_a_id: request.requester_id,
        user_b_id: request.recipient_id,
        conversation_id: request.conversation_id,
        itinerary_id: null,
      })
      .select('*')
      .single()
    if (sErr) {
      return NextResponse.json(
        { error: 'session_create_failed', message: sErr.message },
        { status: 500 },
      )
    }

    // Mark the request as accepted
    const { error: uErr } = await supabase
      .from('focus_requests')
      .update({ status: 'accepted' })
      .eq('id', request.id)
    if (uErr) {
      return NextResponse.json({ error: 'update_failed' }, { status: 500 })
    }

    // Flip the buddy's is_in_focus flag (if either party has a buddies row)
    await supabase
      .from('buddies')
      .update({ is_in_focus: true })
      .in('id', [request.requester_id, request.recipient_id])

    // Best-effort notification to the requester that the recipient accepted.
    try {
      const { data: recipientProfile } = await supabase
        .from('safe_profiles')
        .select('full_name')
        .eq('id', user.id)
        .maybeSingle()
      const recipientName = recipientProfile?.full_name ?? 'Your buddy'
      await supabase.from('notifications').insert({
        user_id: request.requester_id,
        type: 'focus_accepted',
        title: `${recipientName} accepted your Focus request`,
        body: 'Tap to join the shared session.',
        link: `/focus/${session.id}`,
        actor_id: user.id,
        actor_name: recipientName,
      })
    } catch {
      /* ignore */
    }

    return NextResponse.json({ ok: true, status: 'accepted', session }, { status: 201 })
  } catch (err) {
    return NextResponse.json(
      { error: 'server_error', message: (err as Error).message },
      { status: 500 },
    )
  }
}
