import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'

/**
 * GET /api/swipe/matches
 *
 * Lists all matches for the current user. Each match includes the
 * partner's full name + avatar so the client can render the match
 * list without a second round-trip.
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

  if (profile?.role !== 'tourist' && profile?.role !== 'buddy') {
    return NextResponse.json({ error: 'unsupported role' }, { status: 403 })
  }

  const role = profile.role

  const { data, error } = await supabase
    .from('matches')
    .select('id, tourist_id, buddy_id, created_at')
    .or(`tourist_id.eq.${user.id},buddy_id.eq.${user.id}`)
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: 500 })
  }

  type RawMatch = { id: string; tourist_id: string; buddy_id: string; created_at: string }
  const matches = (data ?? []) as RawMatch[]

  if (matches.length === 0) {
    return NextResponse.json({ matches: [] })
  }

  const touristIds = Array.from(new Set(matches.map((m) => m.tourist_id)))
  const buddyIds = Array.from(new Set(matches.map((m) => m.buddy_id)))
  const allProfileIds = Array.from(new Set([...touristIds, ...buddyIds]))

  // Resolve tourist + buddy + profile metadata in parallel. PostgREST
  // can't infer the matches → tourists / matches → buddies FKs without
  // hints, so we do it as a bulk lookup by id.
  const [{ data: profileRows }, { data: buddyRows }, { data: touristRows }] = await Promise.all([
    supabase
      .from('safe_profiles')
      .select('id, full_name, avatar_url, is_online')
      .in('id', allProfileIds),
    supabase
      .from('safe_buddies')
      .select('id, location_city, languages, hourly_rate, rating_avg, bio, specialties')
      .in('id', buddyIds),
    supabase.from('tourists').select('id').in('id', touristIds),
  ])

  const profileMap = new Map<
    string,
    { full_name: string; avatar_url: string | null; is_online: boolean }
  >()
  for (const p of profileRows ?? []) {
    profileMap.set(p.id as string, {
      full_name: (p.full_name as string) ?? 'Traveler',
      avatar_url: (p.avatar_url as string | null) ?? null,
      is_online: (p.is_online as boolean) ?? false,
    })
  }

  const buddyMap = new Map<
    string,
    {
      location_city: string
      languages: string[] | null
      hourly_rate: number | null
      rating_avg: number | null
      bio: string | null
      specialties: string[] | null
    }
  >()
  for (const b of buddyRows ?? []) {
    buddyMap.set(b.id as string, {
      location_city: (b.location_city as string) ?? 'Da Nang',
      languages: (b.languages as string[] | null) ?? [],
      hourly_rate: (b.hourly_rate as number | null) ?? null,
      rating_avg: (b.rating_avg as number | null) ?? null,
      bio: (b.bio as string | null) ?? null,
      specialties: (b.specialties as string[] | null) ?? [],
    })
  }

  // Just to verify the tourist rows exist (FK is enforced but we want
  // a clean response). The presence check is cheap.
  const touristSet = new Set((touristRows ?? []).map((t) => t.id as string))

  const items = matches
    .filter((m) => touristSet.has(m.tourist_id)) // drop orphaned rows
    .map((m) => {
      const touristProfile = profileMap.get(m.tourist_id)
      const buddyProfile = profileMap.get(m.buddy_id)
      const buddyMeta = buddyMap.get(m.buddy_id)
      const isTouristViewer = role === 'tourist'
      return {
        id: m.id,
        created_at: m.created_at,
        tourist: {
          id: m.tourist_id,
          full_name: touristProfile?.full_name ?? 'Traveler',
          avatar_url: touristProfile?.avatar_url ?? null,
          is_online: touristProfile?.is_online ?? false,
        },
        buddy: {
          id: m.buddy_id,
          full_name: buddyProfile?.full_name ?? 'Buddy',
          avatar_url: buddyProfile?.avatar_url ?? null,
          is_online: buddyProfile?.is_online ?? false,
          location_city: buddyMeta?.location_city ?? 'Da Nang',
          languages: buddyMeta?.languages ?? [],
          specialties: buddyMeta?.specialties ?? [],
          hourly_rate: buddyMeta?.hourly_rate ?? null,
          rating_avg: buddyMeta?.rating_avg ?? null,
          bio: buddyMeta?.bio ?? null,
        },
        partner: isTouristViewer
          ? {
              id: m.buddy_id,
              full_name: buddyProfile?.full_name ?? 'Buddy',
              avatar_url: buddyProfile?.avatar_url ?? null,
              is_online: buddyProfile?.is_online ?? false,
              role: 'buddy' as const,
            }
          : {
              id: m.tourist_id,
              full_name: touristProfile?.full_name ?? 'Traveler',
              avatar_url: touristProfile?.avatar_url ?? null,
              is_online: touristProfile?.is_online ?? false,
              role: 'tourist' as const,
            },
      }
    })

  return NextResponse.json({ matches: items })
}
