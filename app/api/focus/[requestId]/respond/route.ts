import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { rateLimit, getClientIp, rateLimitResponse } from '@/utils/rate-limit'
import { z } from 'zod'

// Recipient accepts or declines an incoming focus request.
// On accept: creates a focus_sessions row, marks the request accepted,
// inserts a notification back to the requester, sets the buddy's
// is_in_focus flag, and returns the new session id so the recipient
// can router.push('/focus/<id>').
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

    // Only the recipient may respond
    if (focusReq.recipient_id !== user.id) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }

    // Already terminal?
    if (focusReq.status !== 'pending') {
      return NextResponse.json(
        { error: 'not_pending', status: focusReq.status },
        { status: 409 },
      )
    }

    // Expired?
    if (new Date(focusReq.expires_at).getTime() < Date.now()) {
      // Best-effort: flip to expired so future loads don't show it.
      await supabase
        .from('focus_requests')
        .update({ status: 'expired' })
        .eq('id', focusReq.id)
      return NextResponse.json({ error: 'expired' }, { status: 410 })
    }

    if (action === 'decline') {
      const { error: uErr } = await supabase
        .from('focus_requests')
        .update({ status: 'declined' })
        .eq('id', focusReq.id)
      if (uErr) {
        return NextResponse.json(
          { error: 'update_failed', message: uErr.message },
          { status: 500 },
        )
      }
      // Notify the requester (best-effort).
      try {
        const { data: recipientProfile } = await supabase
          .from('safe_profiles')
          .select('full_name')
          .eq('id', user.id)
          .maybeSingle()
        await supabase.from('notifications').insert({
          user_id: focusReq.requester_id,
          type: 'focus_declined',
          title: `${recipientProfile?.full_name ?? 'Buddy'} declined your Focus request`,
          body: 'They’re not available right now. Try again later.',
          link: `/chat?conv=${focusReq.conversation_id ?? ''}`,
          actor_id: user.id,
          actor_name: recipientProfile?.full_name ?? 'Buddy',
        })
      } catch {
        /* notifications are best-effort */
      }
      return NextResponse.json({ ok: true, status: 'declined' })
    }

    // --- action === 'accept' ---
    // Reject if either side already has an active session.
    const { data: activeA, error: actAErr } = await supabase
      .from('focus_sessions')
      .select('id')
      .or(`user_a_id.eq.${user.id},user_b_id.eq.${user.id}`)
      .is('ended_at', null)
      .maybeSingle()
    if (actAErr) {
      return NextResponse.json({ error: 'lookup_failed' }, { status: 500 })
    }
    if (activeA) {
      return NextResponse.json(
        { error: 'recipient_in_active_session', session_id: activeA.id },
        { status: 409 },
      )
    }
    const { data: activeB, error: actBErr } = await supabase
      .from('focus_sessions')
      .select('id')
      .or(`user_a_id.eq.${focusReq.requester_id},user_b_id.eq.${focusReq.requester_id}`)
      .is('ended_at', null)
      .maybeSingle()
    if (actBErr) {
      return NextResponse.json({ error: 'lookup_failed' }, { status: 500 })
    }
    if (activeB) {
      return NextResponse.json(
        { error: 'requester_in_active_session' },
        { status: 409 },
      )
    }

    // Flip request to accepted + create the session in one transaction.
    const { error: uErr } = await supabase
      .from('focus_requests')
      .update({ status: 'accepted' })
      .eq('id', focusReq.id)
    if (uErr) {
      return NextResponse.json(
        { error: 'update_failed', message: uErr.message },
        { status: 500 },
      )
    }

    const { data: session, error: sErr } = await supabase
      .from('focus_sessions')
      .insert({
        user_a_id: focusReq.requester_id,
        user_b_id: user.id,
        conversation_id: focusReq.conversation_id,
      })
      .select('*')
      .single()
    if (sErr || !session) {
      return NextResponse.json(
        { error: 'session_create_failed', message: sErr?.message ?? 'unknown' },
        { status: 500 },
      )
    }

    // Set the buddy's is_in_focus flag if the buddy has a row.
    await supabase
      .from('buddies')
      .update({ is_in_focus: true })
      .in('id', [focusReq.requester_id, user.id])

    // Notify the requester (best-effort).
    try {
      const { data: recipientProfile } = await supabase
        .from('safe_profiles')
        .select('full_name')
        .eq('id', user.id)
        .maybeSingle()
      await supabase.from('notifications').insert({
        user_id: focusReq.requester_id,
        type: 'focus_accepted',
        title: `${recipientProfile?.full_name ?? 'Buddy'} accepted your Focus request`,
        body: 'Open the chat to start your shared session.',
        link: `/focus/${session.id}`,
        actor_id: user.id,
        actor_name: recipientProfile?.full_name ?? 'Buddy',
      })
    } catch {
      /* notifications are best-effort */
    }

    return NextResponse.json({ ok: true, status: 'accepted', session })
  } catch (err) {
    return NextResponse.json(
      { error: 'server_error', message: (err as Error).message },
      { status: 500 },
    )
  }
}
