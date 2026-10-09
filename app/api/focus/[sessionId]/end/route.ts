import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { rateLimit, getClientIp, rateLimitResponse } from '@/utils/rate-limit'
import { z } from 'zod'

const BodySchema = z.object({
  reason: z.enum(['completed', 'cancelled', 'timeout']).default('cancelled'),
  itinerary_id: z.string().uuid().optional().nullable(),
})

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  try {
    const ip = getClientIp(req)
    const rl = rateLimit(`focus.end.${ip}`, 'focus.end', {
      windowMs: 60_000,
      max: 30,
    })
    if (!rl.ok) return rateLimitResponse(rl.resetAt)

    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }

    const { sessionId } = await params

    let body: { reason?: 'completed' | 'cancelled' | 'timeout'; itinerary_id?: string | null } = {}
    try {
      body = await req.json()
    } catch {
      body = {}
    }
    const parsed = BodySchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'invalid_body', details: parsed.error.flatten() },
        { status: 400 },
      )
    }
    const { reason, itinerary_id } = parsed.data

    const { data: session, error: sErr } = await supabase
      .from('focus_sessions')
      .select('*')
      .eq('id', sessionId)
      .maybeSingle()
    if (sErr) {
      return NextResponse.json({ error: 'lookup_failed' }, { status: 500 })
    }
    if (!session) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 })
    }
    if (session.user_a_id !== user.id && session.user_b_id !== user.id) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }
    if (session.ended_at) {
      return NextResponse.json({ ok: true, status: 'already_ended', session })
    }

    const update: Record<string, unknown> = {
      ended_at: new Date().toISOString(),
      end_reason: reason,
    }
    if (itinerary_id !== undefined) {
      update.itinerary_id = itinerary_id
    }
    const { data: updated, error: uErr } = await supabase
      .from('focus_sessions')
      .update(update)
      .eq('id', session.id)
      .select('*')
      .single()
    if (uErr) {
      return NextResponse.json({ error: 'update_failed', message: uErr.message }, { status: 500 })
    }

    // Reset is_in_focus flag for both buddies (if any has a buddies row)
    await supabase
      .from('buddies')
      .update({ is_in_focus: false })
      .in('id', [session.user_a_id, session.user_b_id])

    return NextResponse.json({ ok: true, session: updated })
  } catch (err) {
    return NextResponse.json(
      { error: 'server_error', message: (err as Error).message },
      { status: 500 },
    )
  }
}
