import { Suspense } from 'react'
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
} | null> {
  const supabase = await createClient()
  // safe_tourists excludes PII (date_of_birth) so an unauthenticated
  // visitor can read name / city / interests / languages / travel_style
  // / arrival_date without a grant exception.
  const { data: t } = await supabase
    .from('safe_tourists')
    .select(
      'id, nationality, travel_style, interests, languages, budget_range, arrival_date, destination, profile:safe_profiles(id, full_name, avatar_url, is_online, role)',
    )
    .eq('id', id)
    .maybeSingle<Tourist & { profile: Profile }>()
  if (!t) return null
  return {
    tourist: t as Tourist,
    profile: t.profile as Profile,
  }
}

export default async function TouristDetailPage({ params }: PageProps) {
  const { id } = await params
  const data = await fetchTourist(id)
  if (!data) notFound()
  return (
    <Suspense
      fallback={
        <div className="container-page py-16 text-center">
          <div className="loading-spinner mx-auto" />
        </div>
      }
    >
      <TouristPublicView tourist={data.tourist} profile={data.profile} />
    </Suspense>
  )
}