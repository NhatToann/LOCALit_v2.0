'use client'

/**
 * SearchContent — interactive /search page.
 *
 * Renders the search box, sort tabs, filter sidebar with facet counts,
 * and result rows. URL is the single source of truth: each filter
 * change pushes a new ?qs to router.replace() (no scroll jump).
 *
 * Server Component (page.tsx) seeds the initial data so first paint
 * is fast and the page is indexable for AI search.
 */

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Sparkles, Search as SearchIcon, MapPin, X, AlertTriangle, ChevronDown } from 'lucide-react'
import { createClient } from '@/utils/supabase/auth'
import {
  parseSearchParams,
  buildSearchLink,
  DEFAULT_RADIUS_KM,
  PAGE_SIZE,
  SORT_OPTIONS,
  type BuddySearchParams,
  type SearchSort,
} from '@/lib/search/searchParams'
import type { BuddySearchResult, SearchFacets } from '@/lib/search/types'
import SearchFilters from '@/components/search/SearchFilters'
import SearchResultRow from '@/components/search/SearchResultRow'

const SAVED_KEY = 'localit:savedBuddies'

function readSaved(): string[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(SAVED_KEY)
    if (!raw) return []
    const arr = JSON.parse(raw)
    return Array.isArray(arr) ? arr.filter((x: unknown) => typeof x === 'string') : []
  } catch {
    return []
  }
}

interface Props {
  initialParams: BuddySearchParams
  initialResults: BuddySearchResult[]
  initialFacets: SearchFacets | null
  initialError: string | null
}

export default function SearchContent({
  initialParams,
  initialResults,
  initialFacets,
  initialError,
}: Props) {
  const router = useRouter()
  const [params, setParams] = useState<BuddySearchParams>(initialParams)
  const [results, setResults] = useState<BuddySearchResult[]>(initialResults)
  const [facets, setFacets] = useState<SearchFacets | null>(initialFacets)
  const [error, setError] = useState<string | null>(initialError)
  const [isPending, startTransition] = useTransition()
  const [qInput, setQInput] = useState<string>(initialParams.q ?? '')
  const [savedBuddies, setSavedBuddies] = useState<string[]>([])
  const savedHydratedRef = useRef(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Hydrate saved buddies once
  useEffect(() => {
    setSavedBuddies(readSaved())
    savedHydratedRef.current = true
  }, [])

  // Persist saved buddies
  useEffect(() => {
    if (!savedHydratedRef.current) return
    try {
      window.localStorage.setItem(SAVED_KEY, JSON.stringify(savedBuddies))
    } catch {
      /* quota or private mode — ignore */
    }
  }, [savedBuddies])

  const toggleSave = (id: string) => {
    setSavedBuddies((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    )
  }

  // Debounce the query input by 250 ms before pushing to the URL
  useEffect(() => {
    if (qInput === (params.q ?? '')) return
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      applyFilter({ q: qInput || undefined }, /* keepPage */ false)
    }, 250)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qInput])

  // Fetch results + facets whenever params change
  useEffect(() => {
    let cancelled = false
    async function run() {
      const supabase = createClient()
      const { data, error: err } = await supabase.rpc('search_buddies', {
        q: params.q ?? '',
        anchor_lat: params.lat ?? null,
        anchor_lng: params.lng ?? null,
        radius_km: params.radius ?? DEFAULT_RADIUS_KM,
        lang: params.lang ?? null,
        tag: params.tag ?? null,
        place: params.place ?? null,
        sort: params.sort ?? 'match',
        limit_n: PAGE_SIZE,
        offset_n: ((params.page ?? 1) - 1) * PAGE_SIZE,
      })
      if (cancelled) return
      if (err) {
        setError(err.message)
      } else {
        setResults((data ?? []) as BuddySearchResult[])
        setError(null)
      }
      const { data: fData } = await supabase.rpc('search_buddies_facets', {
        q: params.q ?? '',
        lang: params.lang ?? null,
        tag: params.tag ?? null,
        place: params.place ?? null,
        anchor_lat: params.lat ?? null,
        anchor_lng: params.lng ?? null,
        radius_km: params.radius ?? DEFAULT_RADIUS_KM,
      })
      if (!cancelled) setFacets((fData ?? null) as SearchFacets | null)
    }
    run()
    return () => {
      cancelled = true
    }
  }, [
    params.q,
    params.lang,
    params.tag,
    params.place,
    params.radius,
    params.sort,
    params.lat,
    params.lng,
    params.page,
  ])

  function applyFilter(patch: Partial<BuddySearchParams>, keepPage = false) {
    const next: BuddySearchParams = { ...params, ...patch }
    if (!keepPage && !('page' in patch)) next.page = 1
    for (const k of Object.keys(next) as (keyof BuddySearchParams)[]) {
      if (next[k] === undefined || next[k] === '' || next[k] === null) {
        delete next[k]
      }
    }
    setParams(next)
    const href = buildSearchLink(next, next)
    startTransition(() => {
      router.replace(href, { scroll: false })
    })
  }

  const hasSearch = Boolean(
    params.q || params.lang || params.tag || params.place || (params.lat != null && params.lng != null),
  )

  const subline = useMemo(() => {
    if (error) return null
    if (results.length === 0) return 'No buddies matched your criteria yet.'
    return `${results.length} ${results.length === 1 ? 'buddy' : 'buddies'} sorted by match score.`
  }, [results.length, error])

  return (
    <div className="container-page py-8">
      <header className="mb-6">
        <p className="text-eyebrow text-primary mb-2">Smart search</p>
        <h1 className="text-page-title">Smart buddy search in Da Nang</h1>
        <p className="text-sm text-muted mt-1 max-w-prose">
          Sort by location, tags, languages, and live availability. 4 weighted signals, one 0-100
          match score. Built for tourists who want the right Da Nang buddy, not the loudest one.
        </p>
      </header>

      {/* Search box + sort */}
      <section
        aria-label="Search controls"
        className="mb-6 border border-border rounded-sm bg-surface p-4"
      >
        <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_auto] gap-3 mb-3">
          <div className="relative">
            <SearchIcon
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-subtle pointer-events-none"
              aria-hidden="true"
            />
            <input
              className="form-input w-full pl-9"
              placeholder="Search by name, specialty, or place (Marble Mountains, food, English…)"
              value={qInput}
              onChange={(e) => setQInput(e.target.value)}
              aria-label="Search Da Nang buddies"
              data-testid="search-input"
            />
          </div>
          <div className="flex flex-wrap gap-2" role="tablist" aria-label="Sort">
            {SORT_OPTIONS.map((s: SearchSort) => {
              const active = (params.sort ?? 'match') === s
              return (
                <button
                  key={s}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => applyFilter({ sort: s === 'match' ? undefined : s })}
                  className={`h-9 px-3 text-sm font-medium rounded-pill border transition-colors duration-150 ${
                    active
                      ? 'bg-primary text-paper border-primary'
                      : 'bg-transparent text-muted border-border hover:text-ink hover:border-border-strong'
                  }`}
                >
                  {s === 'match' ? 'Best match' : s === 'distance' ? 'Nearest' : 'Top rated'}
                </button>
              )
            })}
          </div>
          {hasSearch ? (
            <Link
              href="/search"
              className="inline-flex items-center justify-center gap-1 h-9 px-3 text-sm font-medium rounded-sm bg-transparent text-ink border border-border-strong hover:bg-paper"
              onClick={() => {
                setParams({})
                setQInput('')
                startTransition(() => router.replace('/search', { scroll: false }))
              }}
            >
              <X size={14} aria-hidden="true" />
              Clear
            </Link>
          ) : null}
        </div>
        <p className="text-xs text-muted" aria-live="polite">
          {isPending ? 'Updating results…' : subline}
        </p>
      </section>

      {error ? (
        <div className="alert alert-error mb-4" role="alert">
          <AlertTriangle size={16} aria-hidden="true" />
          <span>{error}</span>
        </div>
      ) : null}

      <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-6">
        <aside>
          <SearchFilters
            facets={facets}
            current={params}
            onChange={(patch) => applyFilter(patch)}
          />
        </aside>

        <section aria-label="Search results">
          {results.length === 0 ? (
            <EmptyState params={params} />
          ) : (
            <ul className="divide-y divide-border border border-border rounded-sm bg-surface" data-testid="search-results">
              {results.map((r) => (
                <li key={r.id} data-testid="search-result-row">
                  <SearchResultRow
                    result={r}
                    saved={savedBuddies.includes(r.id)}
                    onToggleSave={() => toggleSave(r.id)}
                  />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  )
}

function EmptyState({ params }: { params: BuddySearchParams }) {
  return (
    <div className="border border-border rounded-sm p-12 text-center bg-surface">
      <Sparkles size={36} className="mx-auto text-subtle mb-3" aria-hidden="true" />
      <h3 className="text-lg font-semibold mb-2">No buddies matched.</h3>
      <p className="text-sm text-muted mb-4 max-w-prose mx-auto">
        {params.q
          ? `Nothing in Da Nang matches "${params.q}". Try a shorter query or remove a filter.`
          : 'Try widening the radius or removing a filter. There are 6+ verified Da Nang buddies in the marketplace.'}
      </p>
      <Link
        href="/browse"
        className="inline-flex items-center justify-center gap-1 h-9 px-3 text-sm font-medium rounded-sm bg-primary text-paper border border-primary hover:bg-primary-hover"
      >
        <ChevronDown size={14} aria-hidden="true" />
        Open the list view
      </Link>
    </div>
  )
}
