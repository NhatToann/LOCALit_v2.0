import { notFound } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import type { Buddy, Profile } from '@/lib/types'
import BuddyPublicView from '@/components/buddy/BuddyPublicView'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ id: string }>
}

async function fetchBuddy(id: string): Promise<{
  buddy: Buddy
  profile: Profile
  ratingAvg: number
  ratingCount: number
} | null> {
  const supabase = await createClient()

  // The public `safe_buddies` view deliberately hides rows without GPS
  // coordinates (PII minimisation). But that view was also our ONLY signal
  // for "this buddy exists", so a legitimate buddy who simply had no
  // coordinates yet got a 404 on their own profile page.
  //
  // Two-tier read: try the safe view first (anon-safe, rounded coords),
  // then fall back to the underlying tables for EXISTENCE only. If the
  // fallback matches we synthesise a buddy record without coordinates so
  // the profile renders and simply has no map pin.
  const { data: b } = await supabase
    .from('safe_buddies')
    .select('id, location_city, latitude, longitude, languages, specialties, hourly_rate, is_available, bio, favorite_places, trips_completed, rating_avg, transport, transport_note, profile:safe_profiles(id, full_name, avatar_url, is_online, role, bio)')
    .eq('id', id)
    .maybeSingle<Buddy & { profile: Profile }>()

  const ratingFor = (reviews: { rating: number }[] | null) => {
    const ratingCount = reviews?.length ?? 0
    const ratingAvg =
      ratingCount > 0
        ? Number(
            ((reviews ?? []).reduce((s: number, r: { rating: number }) => s + (r.rating ?? 0), 0) /
              ratingCount).toFixed(1),
          )
        : 0
    return { ratingAvg, ratingCount }
  }

  if (b) {
    const { data: reviews } = await supabase
      .from('reviews')
      .select('id, rating')
      .eq('reviewee_id', id)
    return {
      buddy: b as Buddy,
      profile: b.profile as Profile,
      ...ratingFor(reviews),
    }
  }

  // Fallback — confirm the profile exists and is actually a buddy.
//
// NOTE: `profiles` cannot be read here. For an anonymous visitor the
// PostgREST layer returns 401 for that table (the 2026-09-26 PII fix
// tightened it beyond a row filter), so querying it would make every
// public profile page 404. `safe_profiles` is the anon-safe view and
// already carries the `role` column we need.
const { data: fallback } = await supabase
    .from('safe_profiles')
    .select('id, full_name, avatar_url, is_online, role, bio')
    .eq('id', id)
    .eq('role', 'buddy')
    .maybeSingle<Profile>()

  if (!fallback) return null

  const { data: row } = await supabase
    .from('safe_buddies_no_coords')
    .select('location_city, languages, specialties, hourly_rate, is_available, bio, favorite_places, trips_completed, transport, transport_note')
    .eq('id', id)
    .maybeSingle<Partial<Buddy>>()

  const synthetic = {
    id: fallback.id,
    location_city: row?.location_city ?? 'Da Nang',
    latitude: 0,
    longitude: 0,
    languages: row?.languages ?? [],
    specialties: row?.specialties ?? [],
    hourly_rate: row?.hourly_rate ?? null,
    is_available: row?.is_available ?? false,
    bio: row?.bio ?? null,
    favorite_places: row?.favorite_places ?? [],
    trips_completed: row?.trips_completed ?? 0,
    rating_avg: 0,
    transport: row?.transport ?? null,
    transport_note: row?.transport_note ?? null,
    // Copy, do not alias — sharing one object with the `profile` field makes
    // the RSC payload contain a circular "$N:" reference, which stops the
    // client components on this page from hydrating.
    profile: { ...fallback },
  } as unknown as Buddy

  const { data: reviews } = await supabase
    .from('reviews')
    .select('id, rating')
    .eq('reviewee_id', id)

  return {
    buddy: synthetic,
    profile: fallback,
    ...ratingFor(reviews),
  }
}

export default async function BuddyDetailPage({ params }: PageProps) {
  const { id } = await params
  const data = await fetchBuddy(id)
  if (!data) notFound()

  // No <Suspense> boundary — same reason as /tourists/[id]. The page
  // awaits all of its data before rendering, so the boundary had no
  // streaming work to do, yet it held the whole client subtree in
  // React's pending state: `ConnectButton`'s effect never ran and the
  // button sat on "Checking connection status" forever.
  return (
    <BuddyPublicView
      buddy={data.buddy}
      profile={data.profile}
      ratingAvg={data.ratingAvg}
      ratingCount={data.ratingCount}
    />
  )
}