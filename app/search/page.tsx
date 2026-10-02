import { Suspense } from 'react'
import { createClient } from '@/utils/supabase/auth'
import { parseSearchParams, DEFAULT_RADIUS_KM, PAGE_SIZE, type BuddySearchParams } from '@/lib/search/searchParams'
import type { BuddySearchResult, SearchFacets } from '@/lib/search/types'
import SearchContent from './SearchContent'

export const dynamic = 'force-dynamic'

interface PageProps {
  searchParams: Record<string, string | string[] | undefined>
}

async function fetchResults(
  sp: BuddySearchParams,
): Promise<{ results: BuddySearchResult[]; facets: SearchFacets | null; error: string | null }> {
  const supabase = createClient()
  const limit = PAGE_SIZE
  const page = sp.page ?? 1
  const offset = (page - 1) * limit

  const rpcArgs = {
    q: sp.q ?? '',
    anchor_lat: sp.lat ?? null,
    anchor_lng: sp.lng ?? null,
    radius_km: sp.radius ?? DEFAULT_RADIUS_KM,
    lang: sp.lang ?? null,
    tag: sp.tag ?? null,
    place: sp.place ?? null,
    sort: sp.sort ?? 'match',
    limit_n: limit,
    offset_n: offset,
  }

  const { data, error } = await supabase.rpc('search_buddies', rpcArgs)
  if (error) {
    return { results: [], facets: null, error: error.message }
  }
  return { results: (data ?? []) as BuddySearchResult[], facets: null, error: null }
}

async function fetchFacets(sp: BuddySearchParams): Promise<SearchFacets | null> {
  const supabase = createClient()
  const facetArgs = {
    q: sp.q ?? '',
    lang: sp.lang ?? null,
    tag: sp.tag ?? null,
    place: sp.place ?? null,
    anchor_lat: sp.lat ?? null,
    anchor_lng: sp.lng ?? null,
    radius_km: sp.radius ?? DEFAULT_RADIUS_KM,
  }
  const { data, error } = await supabase.rpc('search_buddies_facets', facetArgs)
  if (error || !data) return null
  return data as SearchFacets
}

export default async function SearchPage({ searchParams }: PageProps) {
  const sp = parseSearchParams(searchParams)
  // Server-side initial fetch so the first paint is SSR-fast and
  // indexable for AI search engines.
  const [{ results, error }, facets] = await Promise.all([
    fetchResults(sp),
    fetchFacets(sp),
  ])

  return (
    <Suspense
      fallback={
        <div className="container-page py-16 text-center">
          <div className="loading-spinner mx-auto" />
        </div>
      }
    >
      <SearchContent
        initialParams={sp}
        initialResults={results}
        initialFacets={facets}
        initialError={error}
      />
    </Suspense>
  )
}
