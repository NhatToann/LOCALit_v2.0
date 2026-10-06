import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'

/**
 * GET /api/swipe/likes
 *
 * Lists tourists who have liked the currently signed-in buddy. Used
 * by /likes to render "đã có người thích bạn". Realtime: the client
 * subscribes to public.swipes WHERE target_id = buddy.id to refresh
 * this list live.
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

  if (profile?.role !== 'buddy') {
    return NextResponse.json(
      { error: 'this endpoint is for buddies only' },
      { status: 403 },
    )
  }

  // Pull every "tourist liked me" swipe. PostgREST can't infer the
  // swipes → tourists FK automatically (swipes.swiper_id references
  // profiles.id, not tourists.id), so we go in two steps: the
  // swipes query, then a bulk profiles + tourists lookup by the
  // resolved swiper_ids.
  const { data: rows, error } = await supabase
    .from('swipes')
    .select('id, swiper_id, created_at')
    .eq('swiper_role', 'tourist')
    .eq('target_id', user.id)
    .eq('direction', 'like')
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: 500 })
  }

  const swiperIds = (rows ?? []).map((r) => r.swiper_id as string)
  const profileMap = new Map<
    string,
    { full_name: string; avatar_url: string | null; is_online: boolean }
  >()
  const touristMap = new Map<
    string,
    { interests: string[] | null; languages: string[] | null; destination: string | null; travel_style: string | null }
  >()
  if (swiperIds.length > 0) {
    const [{ data: profileRows }, { data: touristRows }] = await Promise.all([
      supabase
        .from('safe_profiles')
        .select('id, full_name, avatar_url, is_online')
        .in('id', swiperIds),
      supabase
        .from('tourists')
        .select('id, interests, languages, destination, travel_style')
        .in('id', swiperIds),
    ])
    for (const p of profileRows ?? []) {
      profileMap.set(p.id as string, {
        full_name: (p.full_name as string) ?? 'Traveler',
        avatar_url: (p.avatar_url as string | null) ?? null,
        is_online: (p.is_online as boolean) ?? false,
      })
    }
    for (const t of touristRows ?? []) {
      touristMap.set(t.id as string, {
        interests: (t.interests as string[] | null) ?? null,
        languages: (t.languages as string[] | null) ?? null,
        destination: (t.destination as string | null) ?? null,
        travel_style: (t.travel_style as string | null) ?? null,
      })
    }
  }

  // Buddy's own specialties (for overlap_count)
  const { data: buddy } = await supabase
    .from('safe_buddies')
    .select('specialties')
    .eq('id', user.id)
    .maybeSingle()

  const buddySpecialties = new Set<string>(
    Array.isArray(buddy?.specialties) ? (buddy!.specialties as string[]) : [],
  )

  // Which tourists has this buddy already liked back?
  const { data: alreadyLiked } = await supabase
    .from('swipes')
    .select('target_id')
    .eq('swiper_role', 'buddy')
    .eq('swiper_id', user.id)
    .eq('direction', 'like')

  const likedBackIds = new Set((alreadyLiked ?? []).map((r) => r.target_id as string))

  const result = (rows ?? []).map((r) => {
    const touristId = r.swiper_id as string
    const t = touristMap.get(touristId)
    const p = profileMap.get(touristId)
    const interests = t?.interests ?? []
    const overlap = interests.filter((i) => buddySpecialties.has(i)).length
    return {
      swipe_id: r.id as string,
      tourist_id: touristId,
      full_name: p?.full_name ?? 'Traveler',
      avatar_url: p?.avatar_url ?? null,
      is_online: p?.is_online ?? false,
      interests,
      languages: t?.languages ?? [],
      destination: t?.destination ?? null,
      travel_style: t?.travel_style ?? null,
      overlap_count: overlap,
      liked_back: likedBackIds.has(touristId),
      liked_at: r.created_at as string,
    }
  })

  return NextResponse.json({ likes: result })
}
