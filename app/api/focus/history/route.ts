import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'

const LIMIT = 20

export async function GET(_req: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }

    // Past sessions: ended_at IS NOT NULL
    const { data: sessions, error: sErr } = await supabase
      .from('focus_sessions')
      .select('*')
      .or(`user_a_id.eq.${user.id},user_b_id.eq.${user.id}`)
      .not('ended_at', 'is', null)
      .order('ended_at', { ascending: false })
      .limit(LIMIT)
    if (sErr) {
      return NextResponse.json({ error: 'lookup_failed' }, { status: 500 })
    }
    if (!sessions || sessions.length === 0) {
      return NextResponse.json({ ok: true, items: [] })
    }

    // Collect partner IDs and itinerary IDs
    const partnerIds = Array.from(
      new Set(
        sessions.map((s) =>
          s.user_a_id === user.id ? s.user_b_id : s.user_a_id,
        ),
      ),
    )
    const itineraryIds = sessions
      .map((s) => s.itinerary_id)
      .filter((x): x is string => !!x)

    const [{ data: partners }, { data: itineraries }] = await Promise.all([
      supabase
        .from('safe_profiles')
        .select('id, full_name, avatar_url, role')
        .in('id', partnerIds),
      itineraryIds.length
        ? supabase
            .from('itineraries')
            .select('id, title')
            .in('id', itineraryIds)
        : Promise.resolve({ data: [] as any[] }),
    ])

    const partnerById = new Map<string, { id: string; full_name: string; avatar_url: string | null; role: string }>()
    for (const p of partners ?? []) {
      partnerById.set(p.id, p)
    }
    const itineraryById = new Map<string, { id: string; title: string }>()
    for (const it of itineraries ?? []) {
      itineraryById.set(it.id, it)
    }

    const items = sessions.map((s) => {
      const partnerId = s.user_a_id === user.id ? s.user_b_id : s.user_a_id
      const partner = partnerById.get(partnerId)
      const itinerary = s.itinerary_id ? itineraryById.get(s.itinerary_id) : null
      const started = new Date(s.started_at).getTime()
      const ended = new Date(s.ended_at!).getTime()
      const durationMinutes = Math.max(0, Math.round((ended - started) / 60000))
      return {
        id: s.id,
        partnerId,
        partnerName: partner?.full_name ?? 'Buddy',
        partnerAvatar: partner?.avatar_url ?? null,
        startedAt: s.started_at,
        endedAt: s.ended_at!,
        durationMinutes,
        itineraryId: s.itinerary_id,
        itineraryTitle: itinerary?.title ?? null,
        endReason: s.end_reason,
      }
    })

    return NextResponse.json({ ok: true, items })
  } catch (err) {
    return NextResponse.json(
      { error: 'server_error', message: (err as Error).message },
      { status: 500 },
    )
  }
}
