import { notFound } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import type { Tourist, Profile } from '@/lib/types'
import TouristPublicView from '@/components/tourist/TouristPublicView'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ id: string }>
}

async function fetchTourist(id: string): Promise<{
  tourist: Tourist
  profile: Profile
  ratingAvg: number
  ratingCount: number
} | null> {
  const supabase = await createClient()

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

  // safe_tourists excludes PII (date_of_birth) so an unauthenticated
  // visitor can read name / city / interests / languages / travel_style
  // / arrival_date without a grant exception.
  //
  // It may also filter rows (e.g. by destination), so it must not be the
  // sole existence check — a valid tourist could otherwise 404 on their
  // own profile. Fall back to the base tables for existence only.
  const { data: t } = await supabase
    .from('safe_tourists')
    .select(
      'id, nationality, travel_style, interests, languages, budget_range, arrival_date, destination, profile:safe_profiles(id, full_name, avatar_url, is_online, role, bio)',
    )
    .eq('id', id)
    .maybeSingle<Tourist & { profile: Profile }>()

  if (t) {
    const { data: reviews } = await supabase
      .from('reviews')
      .select('id, rating')
      .eq('reviewee_id', id)
    return {
      tourist: t as Tourist,
      profile: t.profile as Profile,
      ...ratingFor(reviews),
    }
  }

  // `profiles` is unreadable for anonymous visitors (PostgREST returns
  // 401 after the 2026-09-26 PII tightening), so existence must be
  // confirmed through the anon-safe `safe_profiles` view.
  const { data: fallback } = await supabase
    .from('safe_profiles')
    .select('id, full_name, avatar_url, is_online, role, bio')
    .eq('id', id)
    .eq('role', 'tourist')
    .maybeSingle<Profile>()

  if (!fallback) return null

  const { data: row } = await supabase
    .from('safe_tourists_no_visibility_filter')
    .select('nationality, travel_style, interests, languages, budget_range, arrival_date, destination')
    .eq('id', id)
    .maybeSingle<Partial<Tourist>>()

  const synthetic = {
    id: fallback.id,
    nationality: row?.nationality ?? null,
    travel_style: row?.travel_style ?? null,
    interests: row?.interests ?? [],
    languages: row?.languages ?? [],
    budget_range: row?.budget_range ?? null,
    arrival_date: row?.arrival_date ?? null,
    destination: row?.destination ?? 'Da Nang',
    date_of_birth: null,
    // Copy the fields rather than aliasing `fallback`. Sharing one object
    // between `tourist.profile` and `profile` makes React's RSC serializer
    // emit a circular "$N:..." reference, which leaves the client component
    // stuck on the Suspense fallback — no hydration, no connect button.
    profile: { ...fallback },
  } as unknown as Tourist

  const { data: reviews } = await supabase
    .from('reviews')
    .select('id, rating')
    .eq('reviewee_id', id)

  return {
    tourist: synthetic,
    profile: fallback,
    ...ratingFor(reviews),
  }
}

export default async function TouristDetailPage({ params }: PageProps) {
  const { id } = await params
  const data = await fetchTourist(id)
  if (!data) notFound()

  // No <Suspense> boundary here.
  //
  // WHY (2026-10-10)
  // This page awaited everything it needed BEFORE rendering, so the
  // boundary had no streaming work to do — it was pure overhead. But a
  // boundary whose fallback already resolved still costs a client
  // Suspense marker, and React kept the whole subtree in the "pending"
  // state: the SSR HTML rendered, yet `ConnectButton`'s `useEffect`
  // NEVER ran, so its `connections` query was never issued and the
  // button sat on "Checking connection status" forever. That is what
  // made a notification "not tappable" — the deep link worked, but the
  // page it landed on had no live Respond button.
  //
  // `TouristPublicView` is a client component with no `use()` / no async
  // children, so removing the boundary cannot introduce a new stall.
  return (
    <TouristPublicView
      tourist={data.tourist}
      profile={data.profile}
      ratingAvg={data.ratingAvg}
      ratingCount={data.ratingCount}
    />
  )
}