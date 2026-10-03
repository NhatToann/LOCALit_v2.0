import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import type { Buddy, Profile } from '@/lib/types'
import BuddyPublicView from '@/components/buddy/BuddyPublicView'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: { id: string }
}

async function fetchBuddy(id: string): Promise<{
  buddy: Buddy
  profile: Profile
  ratingAvg: number
  ratingCount: number
} | null> {
  const supabase = await createClient()
  const { data: b } = await supabase
    .from('safe_buddies')
    .select('id, location_city, latitude, longitude, languages, specialties, hourly_rate, is_available, bio, favorite_places, trips_completed, rating_avg, transport, transport_note, profile:safe_profiles(id, full_name, avatar_url, is_online, role)')
    .eq('id', id)
    .maybeSingle<Buddy & { profile: Profile }>()
  if (!b) return null

  const { data: reviews } = await supabase
    .from('reviews')
    .select('id, rating, comment, created_at, reviewer:reviewer_id(full_name)')
    .eq('reviewee_id', id)
    .order('created_at', { ascending: false })
    .limit(20)
  const ratingCount = reviews?.length ?? 0
  const ratingAvg =
    ratingCount > 0
      ? Number(((reviews ?? []).reduce((s: number, r: any) => s + (r.rating ?? 0), 0) / ratingCount).toFixed(1))
      : 0

  return {
    buddy: b as Buddy,
    profile: b.profile as Profile,
    ratingAvg,
    ratingCount,
  }
}

export default async function BuddyDetailPage({ params }: PageProps) {
  const data = await fetchBuddy(params.id)
  if (!data) notFound()
  return (
    <Suspense
      fallback={
        <div className="container-page py-16 text-center">
          <div className="loading-spinner mx-auto" />
        </div>
      }
    >
      <BuddyPublicView
        buddy={data.buddy}
        profile={data.profile}
        ratingAvg={data.ratingAvg}
        ratingCount={data.ratingCount}
      />
    </Suspense>
  )
}
