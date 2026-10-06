import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'

/**
 * GET /api/swipe/liked
 *
 * Lists every buddy that the currently signed-in tourist has liked.
 * Each entry is paired with `matched: boolean` so the client can
 * show the same list under two views ("Liked" + "Matches") without
 * a second round-trip. This endpoint is intentionally tourist-only:
 * buddies use /api/swipe/likes to see who liked them.
 *
 * Auth: server-side getUser() + role check. The query uses
 * `swiper_id = auth.uid()` so an RLS-unsafe role change still
 * cannot leak rows belonging to other users.
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()

  if (profile?.role !== 'tourist') {
    return NextResponse.json(
      { error: 'this endpoint is for tourists only' },
      { status: 403 },
    )
  }

  // Pull every "I liked them" swipe in reverse chronological order.
  const { data: swipeRows, error } = await supabase
    .from('swipes')
    .select('id, target_id, created_at')
    .eq('swiper_role', 'tourist')
    .eq('swiper_id', user.id)
    .eq('direction', 'like')
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: 500 })
  }

  const rows = swipeRows ?? []
  if (rows.length === 0) {
    return NextResponse.json({ liked: [] })
  }

  const targetIds = Array.from(new Set(rows.map((r) => r.target_id as string)))

  // Resolve buddy + match state in parallel.
  const [{ data: buddyRows }, { data: matchRows }] = await Promise.all([
    supabase
      .from('safe_buddies')
      .select(
        'id, location_city, languages, specialties, hourly_rate, rating_avg, bio, latitude, longitude',
      )
      .in('id', targetIds),
    supabase
      .from('matches')
      .select('id, buddy_id, created_at')
      .eq('tourist_id', user.id)
      .in('buddy_id', targetIds),
  ])

  const buddyMap = new Map<string, {
    location_city: string
    languages: string[]
    specialties: string[]
    hourly_rate: number | null
    rating_avg: number | null
    bio: string | null
    latitude: number
    longitude: number
  }>()
  for (const b of buddyRows ?? []) {
    buddyMap.set(b.id as string, {
      location_city: (b.location_city as string) ?? 'Da Nang',
      languages: (b.languages as string[] | null) ?? [],
      specialties: (b.specialties as string[] | null) ?? [],
      hourly_rate: (b.hourly_rate as number | null) ?? null,
      rating_avg: (b.rating_avg as number | null) ?? null,
      bio: (b.bio as string | null) ?? null,
      latitude: Number(b.latitude),
      longitude: Number(b.longitude),
    })
  }

  const matchMap = new Map<string, { match_id: string; matched_at: string }>()
  for (const m of matchRows ?? []) {
    matchMap.set(m.buddy_id as string, {
      match_id: m.id as string,
      matched_at: m.created_at as string,
    })
  }

  // Profile rows for avatar + name. Profiles is wide so we join on
  // safe_profiles to keep lat/lng off the wire for this endpoint.
  const { data: profileRows } = await supabase
    .from('safe_profiles')
    .select('id, full_name, avatar_url, is_online')
    .in('id', targetIds)
  const profileMap = new Map<
    string,
    { full_name: string; avatar_url: string | null; is_online: boolean }
  >()
  for (const p of profileRows ?? []) {
    profileMap.set(p.id as string, {
      full_name: (p.full_name as string) ?? 'Buddy',
      avatar_url: (p.avatar_url as string | null) ?? null,
      is_online: (p.is_online as boolean) ?? false,
    })
  }

  const items = rows
    .filter((r) => buddyMap.has(r.target_id as string)) // drop buddies that left the safe view
    .map((r) => {
      const buddyId = r.target_id as string
      const meta = buddyMap.get(buddyId)!
      const prof = profileMap.get(buddyId)
      const match = matchMap.get(buddyId) ?? null
      return {
        swipe_id: r.id as string,
        liked_at: (match?.matched_at ?? r.created_at) as string,
        matched: match !== null,
        match_id: match?.match_id ?? null,
        buddy: {
          id: buddyId,
          full_name: prof?.full_name ?? 'Buddy',
          avatar_url: prof?.avatar_url ?? null,
          is_online: prof?.is_online ?? false,
          ...meta,
        },
      }
    })

  return NextResponse.json({ liked: items })
}