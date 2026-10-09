import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { rateLimit, getClientIp, rateLimitResponse } from '@/utils/rate-limit'
import { z } from 'zod'

// Body validation
const BodySchema = z.object({
  recipient_id: z.string().uuid(),
  conversation_id: z.string().uuid().optional().nullable(),
})

const REQUEST_TTL_MINUTES = 5

export async function POST(req: NextRequest) {
  try {
    // Rate limit: 10 req / min / IP
    const ip = getClientIp(req)
    const rl = rateLimit(`focus.request.${ip}`, 'focus.request', {
      windowMs: 60_000,
      max: 10,
    })
    if (!rl.ok) return rateLimitResponse(rl.resetAt)

    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }

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
    const { recipient_id, conversation_id } = parsed.data

    if (recipient_id === user.id) {
      return NextResponse.json({ error: 'self_request_not_allowed' }, { status: 400 })
    }

    // Recipient must exist and (ideally) be online. We don't hard-fail on
    // offline because the partner may come online within the 5-min window.
    const { data: recipientProfile, error: rpErr } = await supabase
      .from('profiles')
      .select('id, full_name, is_online, role')
      .eq('id', recipient_id)
      .maybeSingle()
    if (rpErr) {
      return NextResponse.json({ error: 'lookup_failed' }, { status: 500 })
    }
    if (!recipientProfile) {
      return NextResponse.json({ error: 'recipient_not_found' }, { status: 404 })
    }

    // 2026-10-09: chat now allows any two users regardless of role, but
    // Focus Mode is still a cross-role-only feature (a tourist pairs with
    // a buddy, or vice versa). Same-role Focus requests are rejected
    // with the role-specific message the user asked for.
    const { data: requesterProfileRow } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle()
    const requesterRole = requesterProfileRow?.role as 'tourist' | 'buddy' | 'admin' | null
    const recipientRole = recipientProfile.role as 'tourist' | 'buddy' | 'admin' | null
    if (
      requesterRole &&
      requesterRole !== 'admin' &&
      recipientRole &&
      requesterRole === recipientRole
    ) {
      return NextResponse.json(
        {
          error: 'same_role_focus_not_allowed',
          message:
            'đối với người có cùng role không thể dùng chức năng focus',
          requester_role: requesterRole,
          recipient_role: recipientRole,
        },
        { status: 400 },
      )
    }

    // Reject if requester already has a pending request to this recipient
    const { data: existing, error: exErr } = await supabase
      .from('focus_requests')
      .select('id, status, expires_at')
      .eq('requester_id', user.id)
      .eq('recipient_id', recipient_id)
      .eq('status', 'pending')
      .gt('expires_at', new Date().toISOString())
      .maybeSingle()
    if (exErr) {
      return NextResponse.json({ error: 'lookup_failed' }, { status: 500 })
    }
    if (existing) {
      return NextResponse.json(
        { error: 'pending_request_exists', request: existing },
        { status: 409 },
      )
    }

    // Reject if requester already has an ACTIVE focus session
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
        { error: 'requester_in_active_session', session_id: activeA.id },
        { status: 409 },
      )
    }

    // Reject if recipient already has an ACTIVE focus session
    const { data: activeB, error: actBErr } = await supabase
      .from('focus_sessions')
      .select('id')
      .or(`user_a_id.eq.${recipient_id},user_b_id.eq.${recipient_id}`)
      .is('ended_at', null)
      .maybeSingle()
    if (actBErr) {
      return NextResponse.json({ error: 'lookup_failed' }, { status: 500 })
    }
    if (activeB) {
      return NextResponse.json(
        { error: 'recipient_in_active_session' },
        { status: 409 },
      )
    }

    const expiresAt = new Date(Date.now() + REQUEST_TTL_MINUTES * 60_000).toISOString()

    const { data: request, error: insErr } = await supabase
      .from('focus_requests')
      .insert({
        requester_id: user.id,
        recipient_id,
        conversation_id: conversation_id ?? null,
        status: 'pending',
        expires_at: expiresAt,
      })
      .select('*')
      .single()
    if (insErr) {
      return NextResponse.json({ error: 'insert_failed', message: insErr.message }, { status: 500 })
    }

    // Insert a notification row so the recipient gets a bell-icon update
    // even if their chat page isn't open. Best-effort: a failure here
    // must not block the request — the realtime subscription on
    // focus_requests already covers the live case.
    try {
      const { data: requesterProfile } = await supabase
        .from('safe_profiles')
        .select('full_name')
        .eq('id', user.id)
        .maybeSingle()
      const requesterName = requesterProfile?.full_name ?? 'A buddy'
      await supabase.from('notifications').insert({
        user_id: recipient_id,
        type: 'focus_request',
        title: `${requesterName} started a Focus session`,
        body: 'Open the chat to accept or decline within 5 minutes.',
        link: `/chat?conv=${conversation_id ?? ''}`,
        actor_id: user.id,
        actor_name: requesterName,
      })
    } catch {
      /* notifications are best-effort */
    }

    return NextResponse.json({ ok: true, request }, { status: 201 })
  } catch (err) {
    return NextResponse.json(
      { error: 'server_error', message: (err as Error).message },
      { status: 500 },
    )
  }
}
