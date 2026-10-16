/**
 * PATCH /api/connections/[id]
 *   body: { action: 'accept' | 'reject' | 'cancel' | 'renew' }
 *
 * Authorisation: caller must be requester_id OR recipient_id.
 *
 * Side effects:
 *   • accept  → sets status=accepted, accepted_at=now, expires_at stamp via trigger
 *   • reject  → status=declined, ended_at=now
 *   • cancel  → DELETE the row (caller-side cancel; 'ended' is set by status
 *               change if you want to keep history instead — see schema for
 *               choice. We DELETE pending cancels because the sender usually
 *               wants to start fresh; status='ended' is the archive path).
 *   • renew   → public.renew_connection(uuid) RPC; resets expires_at,
 *               clears locked_at, stamps renewed_at.
 *
 * Rate limit: 30 actions / 60s / IP.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { rateLimit, getClientIp, rateLimitResponse } from '@/utils/rate-limit'
import { z } from 'zod'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const PatchSchema = z.object({
  action: z.enum(['accept', 'reject', 'cancel', 'renew']),
})

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ip = getClientIp(req)
    const rl = rateLimit(`connections.patch.${ip}`, 'connections.patch', {
      windowMs: 60_000,
      max: 30,
    })
    if (!rl.ok) return rateLimitResponse(rl.resetAt)

    const { id } = await params
    if (!UUID_RE.test(id)) {
      return NextResponse.json({ error: 'invalid_id' }, { status: 400 })
    }

    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

    let body: unknown
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: 'invalid_body' }, { status: 400 })
    }
    const parsed = PatchSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'invalid_body', details: parsed.error.flatten() },
        { status: 400 },
      )
    }
    const { action } = parsed.data

    // Verify the caller is a participant.
    const { data: existing, error: exErr } = await supabase
      .from('connections')
      .select('id, requester_id, recipient_id, status')
      .eq('id', id)
      .maybeSingle()
    if (exErr || !existing) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 })
    }
    if (existing.requester_id !== user.id && existing.recipient_id !== user.id) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }

    if (action === 'cancel') {
      // Delete: keeps the schema clean and the unique index free.
      // (We can switch to UPDATE status='ended' if a history view is wanted.)
      const { error: delErr } = await supabase
        .from('connections')
        .delete()
        .eq('id', id)
      if (delErr) {
        return NextResponse.json(
          { error: 'delete_failed', message: delErr.message },
          { status: 500 },
        )
      }
      // NOTE: notification for the other party is NOT inserted here.
      // The DB trigger only fires on INSERT/UPDATE — not DELETE — so a
      // cancelled request currently does not notify the recipient. This
      // matches the user's mental model (the request simply disappears
      // from the recipient's "Awaiting your reply" list on their next
      // page load). If a future iteration wants a "Connection cancelled"
      // notification, add a DELETE trigger on public.connections.
      return NextResponse.json({ ok: true, action: 'cancel', connection_id: id })
    }

    if (action === 'renew') {
      const { data, error } = await supabase.rpc('renew_connection', {
        p_connection_id: id,
      })
      if (error) {
        return NextResponse.json(
          { error: 'renew_failed', message: error.message },
          { status: 400 },
        )
      }
      return NextResponse.json({ connection: data, action: 'renew' })
    }

    // accept | reject
    const newStatus = action === 'accept' ? 'accepted' : 'declined'
    const { data, error } = await supabase
      .from('connections')
      .update({
        status: newStatus,
        accepted_at: action === 'accept' ? new Date().toISOString() : null,
        ended_at: action === 'reject' ? new Date().toISOString() : null,
      })
      .eq('id', id)
      .select()
      .single()
    if (error) {
      return NextResponse.json(
        { error: 'update_failed', message: error.message },
        { status: 500 },
      )
    }

    // NOTE: notification for the requester is inserted by the DB trigger
    //   public.notify_on_connection()
    // on the connections UPDATE. We deliberately do NOT call
    // insert_notification() here — it would create a second row
    // for the same event. See supabase/migrations/2026-10-16-drop-insert-notification-rpc.sql.

    return NextResponse.json({ connection: data, action })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'unknown'
    return NextResponse.json({ error: 'server_error', message }, { status: 500 })
  }
}
