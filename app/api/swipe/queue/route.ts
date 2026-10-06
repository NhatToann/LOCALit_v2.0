import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'

/**
 * GET /api/swipe/queue
 *
 * Returns buddies ranked by how many interests they share with the
 * currently-signed-in tourist. Buddies the tourist has already
 * swiped on (any direction) are excluded so the deck never
 * resurfaces the same card. Response is paginated.
 *
 * Query params:
 *   - interests: comma-separated specialty slugs the tourist picked
 *                (overrides the profile's interests if provided)
 *   - limit:     page size (default 20, max 50)
 *   - offset:    page offset (default 0)
 *
 * Response shape:
 *   { buddies: SwipeQueueItem[], hasMore: boolean }
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  }

  const role = await getRole(supabase, user.id)
  if (role !== 'tourist') {
    return NextResponse.json(
      { error: 'swipe queue is only available to tourists' },
      { status: 403 },
    )
  }

  const { searchParams } = new URL(request.url)
  const rawInterests = searchParams.get('interests')
  const limit = Math.min(50, Math.max(1, Number(searchParams.get('limit') ?? 20)))
  const offset = Math.max(0, Number(searchParams.get('offset') ?? 0))

  const interests = (rawInterests
    ? rawInterests.split(',').map((s) => s.trim()).filter(Boolean)
    : await getTouristInterests(supabase, user.id)
  ).filter((s) => s.length > 0)

  // Fetch a generous window of buddies so the interest overlap ranking
  // can do its job. safe_buddies (after the 2026-10-06 view fix)
  // filters is_available=true, but the view also lets a user see
  // their own buddies row via the underlying RLS policy. We exclude
  // the current user explicitly so the deck never surfaces the
  // tourist themselves (this is what caused the "cannot swipe on
  // yourself" error when a tourist also had a buddies row).
  const { data: buddies, error: buddiesError } = await supabase
    .from('safe_buddies')
    .select(
      'id, location_city, languages, specialties, hourly_rate, rating_avg, bio, latitude, longitude',
    )
    .neq('id', user.id)
    .limit(100)

  if (buddiesError) {
    return NextResponse.json(
      { error: buddiesError.message, code: buddiesError.code },
      { status: 500 },
    )
  }

  // Buddy ids already swiped (any direction) — exclude them from the deck
  const { data: swipedRows, error: swipedError } = await supabase
    .from('swipes')
    .select('target_id')
    .eq('swiper_role', 'tourist')
    .eq('swiper_id', user.id)

  if (swipedError) {
    return NextResponse.json({ error: swipedError.message }, { status: 500 })
  }
  const swipedIds = new Set((swipedRows ?? []).map((r) => r.target_id as string))

  type RawBuddy = {
    id: string
    location_city: string
    languages: string[] | null
    specialties: string[] | null
    hourly_rate: number | null
    rating_avg: number | null
    bio: string | null
    latitude: number
    longitude: number
  }

  // Single follow-up query for the buddies' full_name / avatar /
  // online status (PostgREST can't infer the safe_buddies → safe_profiles
  // join without an explicit FK hint, so doing it as a second
  // round-trip is more robust than a flaky `!inner(...)`).
  const candidateIds = (buddies ?? [])
    .filter((b) => !swipedIds.has((b as RawBuddy).id))
    .map((b) => (b as RawBuddy).id)
  const profileMap = new Map<
    string,
    { full_name: string; avatar_url: string | null; is_online: boolean }
  >()
  if (candidateIds.length > 0) {
    const { data: profileRows } = await supabase
      .from('safe_profiles')
      .select('id, full_name, avatar_url, is_online')
      .in('id', candidateIds)
    for (const row of profileRows ?? []) {
      profileMap.set(row.id as string, {
        full_name: (row.full_name as string) ?? 'Buddy',
        avatar_url: (row.avatar_url as string | null) ?? null,
        is_online: (row.is_online as boolean) ?? false,
      })
    }
  }

  const interestSet = new Set(interests)
  const ranked = (buddies ?? [])
    .filter((b) => !swipedIds.has((b as RawBuddy).id))
    .map((b) => {
      const buddy = b as RawBuddy
      const buddySpecialties = buddy.specialties ?? []
      const overlap = buddySpecialties.filter((s) => interestSet.has(s)).length
      const profile = profileMap.get(buddy.id)
      return { buddy, overlap, profile }
    })
    // Spec: buddies with the most overlap first, descending down to 1.
    // Buddies with zero overlap are appended below as fallbacks.
    .sort((a, b) => {
      if (a.overlap !== b.overlap) return b.overlap - a.overlap
      // tiebreak: online first, then higher rating
      const aOnline = a.profile?.is_online ? 1 : 0
      const bOnline = b.profile?.is_online ? 1 : 0
      if (aOnline !== bOnline) return bOnline - aOnline
      return (b.buddy.rating_avg ?? 0) - (a.buddy.rating_avg ?? 0)
    })

  const page = ranked.slice(offset, offset + limit).map(({ buddy, overlap, profile }) => ({
    id: buddy.id,
    full_name: profile?.full_name ?? 'Buddy',
    avatar_url: profile?.avatar_url ?? null,
    is_online: profile?.is_online ?? false,
    location_city: buddy.location_city,
    languages: buddy.languages ?? [],
    specialties: buddy.specialties ?? [],
    hourly_rate: buddy.hourly_rate,
    rating_avg: buddy.rating_avg,
    bio: buddy.bio,
    latitude: buddy.latitude,
    longitude: buddy.longitude,
    overlap_count: overlap,
  }))

  return NextResponse.json({
    buddies: page,
    hasMore: offset + page.length < ranked.length,
    total: ranked.length,
    requested_interests: interests,
  })
}

async function getRole(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
): Promise<'tourist' | 'buddy' | 'admin' | null> {
  const { data } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .maybeSingle()
  return (data?.role as 'tourist' | 'buddy' | 'admin' | null) ?? null
}

async function getTouristInterests(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
): Promise<string[]> {
  const { data } = await supabase
    .from('tourists')
    .select('interests')
    .eq('id', userId)
    .maybeSingle()
  return Array.isArray(data?.interests) ? (data!.interests as string[]) : []
}
