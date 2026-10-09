import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'

export async function GET(_req: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }

    // Find active session
    const { data: session, error: sErr } = await supabase
      .from('focus_sessions')
      .select('*')
      .or(`user_a_id.eq.${user.id},user_b_id.eq.${user.id}`)
      .is('ended_at', null)
      .order('started_at', { ascending: false })
      .maybeSingle()
    if (sErr) {
      return NextResponse.json({ error: 'lookup_failed' }, { status: 500 })
    }
    if (!session) {
      return NextResponse.json({ ok: true, session: null })
    }

    const partnerId = session.user_a_id === user.id ? session.user_b_id : session.user_a_id

    const [{ data: partner }, { data: itinerary }] = await Promise.all([
      supabase
        .from('safe_profiles')
        .select('id, full_name, avatar_url, role, is_online')
        .eq('id', partnerId)
        .maybeSingle(),
      session.itinerary_id
        ? supabase
            .from('itineraries')
            .select('id, title, destination, start_date, end_date')
            .eq('id', session.itinerary_id)
            .maybeSingle()
        : Promise.resolve({ data: null as any }),
    ])

    // Also load the pending request (if any) for the banner to show the
    // "waiting" timer on the requester's side.
    const { data: pendingRequest } = await supabase
      .from('focus_requests')
      .select('*')
      .or(`requester_id.eq.${user.id},recipient_id.eq.${user.id}`)
      .eq('status', 'pending')
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    return NextResponse.json({
      ok: true,
      session,
      partner,
      itinerary,
      pending_request: pendingRequest,
    })
  } catch (err) {
    return NextResponse.json(
      { error: 'server_error', message: (err as Error).message },
      { status: 500 },
    )
  }
}
