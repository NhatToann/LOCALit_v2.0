'use client'

import { useEffect, useState, useMemo, Suspense, useCallback } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import dynamic from 'next/dynamic'
import { createClient } from '@/utils/supabase/auth'
import { useIsOnline } from '@/lib/realtime/useGlobalPresence'
import OnlineIndicator from '@/components/presence/OnlineIndicator'
import { useLiveUserLocations } from '@/hooks/useLiveUserLocations'
import { Map as MapIcon, MapPin, Star, ChevronDown, Heart, MessageCircle, X, Search, Users } from 'lucide-react'

const MapView = dynamic(() => import('@/components/map/MapView'), { ssr: false })

/**
 * Discoverable person on /browse — a buddy OR a tourist. Tourists are
 * 2026-10-09 additions so newly-registered travellers (Phan Nhật Toàn,
 * Tá Bảo, etc.) actually appear in the recommend list. The role badge
 * in the row tells the user which side of the marketplace each name is on.
 */
interface BuddyItem {
  id: string
  role: 'buddy' | 'tourist'
  full_name: string
  location_city: string
  latitude: number
  longitude: number
  languages: string[]
  /** Buddy-only. Empty for tourists. */
  specialties: string[]
  /** Buddy-only (USD / hour). */
  hourly_rate: number | null
  /** Buddy-only. Tourists are not rated. */
  rating_avg: number | null
  rating_count: number
  /** Buddy-only. */
  bio: string | null
  is_online: boolean
  avatar_url: string | null
  /** Tourist-only. Empty for buddies. */
  interests: string[]
  /** Tourist-only. */
  nationality: string | null
}

const FILTERS = [
    { id: 'all', label: 'All', labelVi: 'Tất cả' },
    { id: 'top-rated', label: 'Top Rated', labelVi: 'Đánh giá cao' },
    { id: 'near-me', label: 'Near Me', labelVi: 'Gần tôi' },
    { id: 'available', label: 'Available Now', labelVi: 'Đang rảnh' },
    { id: 'saved', label: 'Saved', labelVi: 'Đã lưu' },
  ] as const

const SAVED_KEY = 'localit:savedBuddies'

const LANGUAGES = ['English', 'Vietnamese', 'Japanese', 'Korean', 'French', 'Mandarin', 'Russian']

function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371
  const toRad = (n: number) => (n * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

// Canonical list of tags the search_buddies RPC ranks against. Used
// here to count "tag overlap" between a buddy's specialties and the
// canonical vocabulary so the default "All" sort can show the best
// match-ups first, after proximity.
const CANONICAL_TAGS = [
  'street-food',
  'history',
  'nightlife',
  'photography',
  'shopping',
  'nature',
  'wellness',
  'language-exchange',
  'motorbike-tours',
  'fishing',
  'cooking-class',
  'artisan-craft',
] as const

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

function BrowseContent() {
  const sp = useSearchParams()
  const destinationQuery = (sp.get('destination') ?? '').trim()
  const languageQuery = sp.get('language') ?? ''
  const hasSearch = Boolean(destinationQuery || languageQuery)

  const [buddies, setBuddies] = useState<BuddyItem[]>([])
  const [loading, setLoading] = useState(true)
  const [activeFilter, setActiveFilter] = useState<typeof FILTERS[number]['id']>('all')
  const [languageFilter, setLanguageFilter] = useState<string>(languageQuery)
  const [destinationFilter, setDestinationFilter] = useState<string>(destinationQuery)
  const [expandedBuddyId, setExpandedBuddyId] = useState<string | null>(null)
  const [savedBuddies, setSavedBuddies] = useState<string[]>([])
  const [savedHydrated, setSavedHydrated] = useState(false)
  const [selectedMapId, setSelectedMapId] = useState<string | null>(null)
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number }>({ lat: 16.0544, lng: 108.2023 })
  const [hasGpsFix, setHasGpsFix] = useState(false)
  const [shareLocation, setShareLocation] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  // Distance slider — 50 means "Any distance" (no upper bound applied).
  const [maxDistanceKm, setMaxDistanceKm] = useState<number>(50)
  // Current user id — used by MapView/useLiveUserLocations to filter out
  // the publisher's own row from the location_updates postgres_changes
  // stream (otherwise the map shows two pins for the same position).
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)

  // Hydrate saved buddies from the database on mount. The old
  // localStorage cache is intentionally NOT migrated — saves made
  // before this change never had a backing row, and silently
  // promoting them would surprise the user (saved hearts appearing
  // on a fresh device). If a non-empty localStorage value is found
  // it's flushed to the server once and then cleared.
  useEffect(() => {
    let cancelled = false
    async function hydrate() {
      try {
        // 1. Pull the source of truth.
        const res = await fetch('/api/swipe/saved-ids', { cache: 'no-store' })
        const data = (await res.json()) as { saved_ids?: string[] }
        if (cancelled) return
        let serverIds = Array.isArray(data.saved_ids) ? data.saved_ids : []

        // 2. One-shot migration of any pre-DB localStorage saves.
        const legacy = readSaved()
        if (legacy.length > 0) {
          await Promise.all(
            legacy.map(async (buddyId) => {
              if (serverIds.includes(buddyId)) return
              try {
                await fetch('/api/swipe', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ target_id: buddyId, direction: 'like' }),
                })
                serverIds.push(buddyId)
              } catch {
                /* best effort — the user can re-save */
              }
            }),
          )
          try { window.localStorage.removeItem(SAVED_KEY) } catch { /* ignore */ }
        }

        if (cancelled) return
        setSavedBuddies(serverIds)
      } catch {
        /* leave the list empty; the UI handles no-saves fine */
      } finally {
        if (!cancelled) setSavedHydrated(true)
      }
    }
    void hydrate()
    return () => { cancelled = true }
  }, [])

  const toggleSave = useCallback(async (id: string) => {
    const wasSaved = savedBuddies.includes(id)
    // Optimistic update — flip the heart immediately so the click
    // feels instant. The server call below either confirms (no-op)
    // or rolls back the optimistic state.
    setSavedBuddies((prev) => (wasSaved ? prev.filter((x) => x !== id) : [...prev, id]))
    try {
      const res = await fetch('/api/swipe', {
        method: wasSaved ? 'DELETE' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target_id: id, direction: 'like' }),
      })
      if (!res.ok) throw new Error(`Save failed: ${res.status}`)
    } catch (err) {
      // Roll back the optimistic flip.
      setSavedBuddies((prev) => (wasSaved ? [...prev, id] : prev.filter((x) => x !== id)))
      setLoadError((err as Error).message || 'Could not update saved buddies.')
    }
  }, [savedBuddies])

  const { liveLocations, selfGranted, selfDenied } = useLiveUserLocations({
    enabled: shareLocation,
    selfUserId: currentUserId,
  })

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data }) => {
      setCurrentUserId(data.user?.id ?? null)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setCurrentUserId(session?.user?.id ?? null)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return
    // watchPosition (not getCurrentPosition) so the "You" dot follows the
    // user while the page is open — important on mobile, harmless on desktop.
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude })
        setHasGpsFix(true)
      },
      () => {
        setHasGpsFix(false)
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 },
    )
    return () => navigator.geolocation.clearWatch(id)
  }, [])

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const supabase = createClient()
        // Pull buddies + tourists in parallel. safe_buddies already
        // filters to non-null lat/lng; safe_tourists_with_location
        // (created 2026-10-09) does the same for tourists so the
        // recommend list now covers both sides of the marketplace.
        const [buddiesRes, touristsRes] = await Promise.all([
          supabase
            .from('safe_buddies')
            .select('id, location_city, latitude, longitude, languages, specialties, hourly_rate, is_available, bio, profile:safe_profiles(full_name, avatar_url, is_online, role)')
            .eq('location_city', 'Da Nang')
            .not('latitude', 'is', null)
            .not('longitude', 'is', null),
          supabase
            .from('safe_tourists_with_location')
            .select('id, location_city, latitude, longitude, languages, interests, nationality, travel_style, profile:safe_profiles(full_name, avatar_url, is_online, role)')
            .eq('location_city', 'Da Nang')
            .not('latitude', 'is', null)
            .not('longitude', 'is', null),
        ])

        const buddyData = (buddiesRes.data ?? []) as any[]
        const touristData = (touristsRes.data ?? []) as any[]

        if (buddyData.length === 0 && touristData.length === 0) {
          setBuddies([])
          setLoading(false)
          return
        }

        // Ratings only apply to buddies.
        const buddyIds = buddyData.map((b) => b.id)
        const ratingMap = new Map<string, { sum: number; count: number }>()
        if (buddyIds.length > 0) {
          const { data: reviews } = await supabase
            .from('reviews')
            .select('reviewee_id, rating')
            .in('reviewee_id', buddyIds)
          for (const r of reviews ?? []) {
            const cur = ratingMap.get(r.reviewee_id) ?? { sum: 0, count: 0 }
            cur.sum += r.rating
            cur.count += 1
            ratingMap.set(r.reviewee_id, cur)
          }
        }

        const mapped: BuddyItem[] = [
          ...buddyData
            .filter((b) => b.latitude !== null && b.longitude !== null)
            .map((b) => {
              const r = ratingMap.get(b.id)
              return {
                id: b.id,
                role: 'buddy' as const,
                full_name: b.profile?.full_name ?? 'Buddy',
                location_city: b.location_city,
                latitude: b.latitude,
                longitude: b.longitude,
                languages: b.languages ?? [],
                specialties: b.specialties ?? [],
                hourly_rate: b.hourly_rate ?? null,
                rating_avg: r && r.count > 0 ? r.sum / r.count : null,
                rating_count: r?.count ?? 0,
                bio: b.bio ?? null,
                is_online: b.profile?.is_online ?? false,
                avatar_url: b.profile?.avatar_url ?? null,
                interests: [],
                nationality: null,
              }
            }),
          ...touristData
            .filter((t) => t.latitude !== null && t.longitude !== null)
            .map((t) => ({
              id: t.id,
              role: 'tourist' as const,
              full_name: t.profile?.full_name ?? 'Traveler',
              location_city: t.location_city,
              latitude: t.latitude,
              longitude: t.longitude,
              languages: t.languages ?? [],
              specialties: [],
              hourly_rate: null,
              rating_avg: null,
              rating_count: 0,
              bio: null,
              is_online: t.profile?.is_online ?? false,
              avatar_url: t.profile?.avatar_url ?? null,
              interests: t.interests ?? [],
              nationality: t.nationality ?? null,
            })),
        ]
        setBuddies(mapped)
      } catch (err) {
        setLoadError((err as Error).message || 'Could not load buddies.')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  // Token-level keyword search (AND across tokens) + match-score for
  // sorting. Tokens <3 chars are dropped to avoid false positives
  // (e.g. "to", "an"). countOccurrences is non-overlapping (substring
  // count) so longer tokens naturally score higher.
  const tokenize = (s: string): string[] =>
    s
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length >= 3)

  const scoreMatch = (haystack: string, tokens: string[]): number =>
    tokens.reduce((acc, t) => {
      if (!t) return acc
      let from = 0
      let count = 0
      while (true) {
        const idx = haystack.indexOf(t, from)
        if (idx === -1) break
        count += 1
        from = idx + t.length
      }
      return acc + count
    }, 0)

  const filtered = useMemo(() => {
    const tokens = tokenize(destinationFilter)
    let list = buddies

    // Distance slider — 50 km means "Any distance" (skip filter).
    if (maxDistanceKm < 50) {
      list = list.filter(
        (b) => haversineKm(userLocation, { lat: b.latitude, lng: b.longitude }) <= maxDistanceKm,
      )
    }

    // Token keyword filter (AND across tokens) + match-score for sort.
    const scored: Array<{ b: BuddyItem; score: number }> = []
    for (const b of list) {
      const hay = [
        b.full_name,
        b.location_city,
        b.bio ?? '',
        ...b.specialties,
        ...b.languages,
      ]
        .join(' ')
        .toLowerCase()
      if (tokens.length > 0) {
        const allMatch = tokens.every((t) => hay.includes(t))
        if (!allMatch) continue
        scored.push({ b, score: scoreMatch(hay, tokens) })
      } else {
        scored.push({ b, score: 0 })
      }
    }

    let result = scored.map((s) => s.b)
    if (languageFilter) {
      result = result.filter((b) =>
        b.languages.some((l) => l.toLowerCase().includes(languageFilter.toLowerCase())),
      )
    }
    result = [...result]
    if (activeFilter === 'top-rated') {
      result.sort((a, b) => (b.rating_avg ?? 0) - (a.rating_avg ?? 0))
    } else if (activeFilter === 'near-me') {
      result.sort(
        (a, b) =>
          haversineKm(userLocation, { lat: a.latitude, lng: a.longitude }) -
          haversineKm(userLocation, { lat: b.latitude, lng: b.longitude }),
      )
    } else if (activeFilter === 'available') {
      result = result.filter((b) => b.is_online)
    } else if (activeFilter === 'saved') {
      result = result.filter((b) => savedBuddies.includes(b.id))
    } else if (activeFilter === 'all' && tokens.length > 0) {
      // Default sort when searching: highest match-score first.
      const scoreMap = new Map(scored.map((s) => [s.b.id, s.score]))
      result.sort((a, b) => (scoreMap.get(b.id) ?? 0) - (scoreMap.get(a.id) ?? 0))
    } else if (activeFilter === 'all') {
      // Default sort with no search: location first, then tag overlap
      // against the canonical vocabulary, then rating. This is the
      // "suggest" experience: closest matches with the most
      // relevant tags float to the top. Tourists have no rating and
      // no specialties, so we treat their `interests` as a free-form
      // tag list for overlap purposes (siblings of specialties).
      const canonicalSet = new Set<string>(CANONICAL_TAGS)
      const tagsFor = (b: BuddyItem) =>
        b.role === 'buddy' ? b.specialties ?? [] : b.interests ?? []
      const tagOverlap = (b: BuddyItem) =>
        tagsFor(b).filter((s) => canonicalSet.has(s.toLowerCase())).length
      // Bump buddies above tourists on ties so the list is biased
      // toward the user-actionable side of the marketplace, but keep
      // tourists visible right below them.
      const roleRank = (b: BuddyItem) => (b.role === 'buddy' ? 0 : 1)
      result.sort((a, b) => {
        const distA = haversineKm(userLocation, { lat: a.latitude, lng: a.longitude })
        const distB = haversineKm(userLocation, { lat: b.latitude, lng: b.longitude })
        if (distA !== distB) return distA - distB
        const tagA = tagOverlap(a)
        const tagB = tagOverlap(b)
        if (tagA !== tagB) return tagB - tagA
        const roleA = roleRank(a)
        const roleB = roleRank(b)
        if (roleA !== roleB) return roleA - roleB
        return (b.rating_avg ?? 0) - (a.rating_avg ?? 0)
      })
    }
    return result
  }, [buddies, destinationFilter, languageFilter, activeFilter, userLocation, savedBuddies, maxDistanceKm])

  // Match-score map for rendering the badge.
  const matchScoreMap = useMemo(() => {
    const tokens = tokenize(destinationFilter)
    if (tokens.length === 0) return new Map<string, number>()
    const m = new Map<string, number>()
    for (const b of buddies) {
      const hay = [
        b.full_name,
        b.location_city,
        b.bio ?? '',
        ...b.specialties,
        ...b.languages,
      ]
        .join(' ')
        .toLowerCase()
      m.set(b.id, scoreMatch(hay, tokens))
    }
    return m
  }, [buddies, destinationFilter])

  const selectedBuddy = filtered.find((b) => b.id === selectedMapId) ?? null

  return (
    <div className="container-page py-8">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-page-title">
            {hasSearch ? 'Search results' : 'Find people in Da Nang'}
          </h1>
          <p className="text-sm text-muted mt-1">
            <span>
              {loading
                ? 'Loading Da Nang people...'
                : `${filtered.length} ${filtered.length === 1 ? 'person' : 'people'}${destinationFilter ? ` for "${destinationFilter}"` : ''}`}
            </span>
            <span
              className="ml-2 italic text-subtle"
              style={{ letterSpacing: '0.01em' }}
              aria-hidden="true"
            >
              {hasSearch ? 'kết quả' : 'bạn đồng hành & hướng dẫn viên'}
            </span>
          </p>
        </div>
      </header>

      {/* Filters */}
      <section
        aria-label="Filters"
        className="mb-6 border border-border rounded-sm bg-surface p-4"
      >
        {hasSearch ? (
          <div className="flex flex-wrap items-center justify-between gap-2 pb-3 mb-3 border-b border-border text-sm">
            <p className="text-muted">
              Showing results for{' '}
              <strong className="text-ink">{destinationFilter || 'Da Nang'}</strong>
              {languageFilter ? <> · Language: <strong className="text-ink">{languageFilter}</strong></> : null}
            </p>
            <Link href="/browse" className="text-primary hover:underline text-sm">
              Clear search
            </Link>
          </div>
        ) : null}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
          <div className="relative md:col-span-2">
            <Search
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-subtle pointer-events-none"
              aria-hidden="true"
            />
            <input
              className="form-input w-full pl-9"
              placeholder="Search Da Nang buddies by name, area, or interest"
              value={destinationFilter}
              onChange={(e) => setDestinationFilter(e.target.value)}
              aria-label="Search Da Nang buddies"
            />
          </div>
          <select
            className="form-input form-select"
            value={languageFilter}
            onChange={(e) => setLanguageFilter(e.target.value)}
            aria-label="Filter by language"
          >
            <option value="">All languages</option>
            {LANGUAGES.map((l) => (
              <option key={l} value={l}>{l}</option>
            ))}
          </select>
        </div>

        <div className="flex flex-wrap gap-2" role="tablist">
          {FILTERS.map((filter) => {
            const active = activeFilter === filter.id
            return (
              <button
                key={filter.id}
                role="tab"
                aria-selected={active}
                onClick={() => setActiveFilter(filter.id)}
                aria-label={filter.label}
                className={`h-8 px-3 text-sm font-medium rounded-pill border transition-colors duration-150 flex flex-col items-center justify-center leading-tight ${
                  active
                    ? 'bg-primary text-paper border-primary'
                    : 'bg-transparent text-muted border-border hover:text-ink hover:border-border-strong'
                }`}
              >
                <span>{filter.label}</span>
                <span
                  className="text-[10px] italic"
                  style={{ letterSpacing: '0.02em', opacity: 0.75 }}
                  aria-hidden="true"
                >
                  {filter.labelVi}
                </span>
              </button>
            )
          })}
        </div>

        {/* Distance slider — 50 = "Any distance" (no upper bound). */}
        <div className="mt-3 pt-3 border-t border-border">
          <div className="flex items-center justify-between mb-1.5">
            <label
              htmlFor="distance-slider"
              className="text-xs font-medium text-ink"
            >
              Distance
              <span
                className="ml-1 italic text-muted font-normal"
                style={{ letterSpacing: '0.02em' }}
                aria-hidden="true"
              >
                khoảng cách
              </span>
            </label>
            <span
              className="text-xs text-muted"
              style={{
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {maxDistanceKm >= 50 ? 'Any distance' : `Within ${maxDistanceKm} km`}
            </span>
          </div>
          <input
            id="distance-slider"
            type="range"
            min={0}
            max={50}
            step={1}
            value={maxDistanceKm}
            onChange={(e) => setMaxDistanceKm(Number(e.target.value))}
            aria-label="Maximum distance from your location in kilometres"
            className="w-full accent-primary"
          />
          <div
            className="flex justify-between text-[10px] text-subtle mt-0.5"
            style={{
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            <span>0 km</span>
            <span>25 km</span>
            <span>Any</span>
          </div>
        </div>
      </section>

      {/* Map — same pattern as /dashboard: section header above
          the map with the share-location toggle anchored to the
          right of the header (NOT absolute-positioned over the
          map, which the previous version did and which caused
          Leaflet panes to eat the click). The map below is the
          dominant element. The section caption was moved BELOW
          the map in a previous commit, but we now restore the
          "Find buddies around Da Nang" title above the map and
          move it inline with the share toggle so the layout
          matches the dashboard's "Who is in Da Nang right now"
          hero section 1:1. */}
      <section
        aria-labelledby="buddies-map-title"
        className="map-frame mb-6 border border-border rounded-sm overflow-hidden bg-surface"
        style={{ position: 'relative', zIndex: 0, isolation: 'isolate' }}
      >
        <div className="px-6 py-4 border-b border-border flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="buddies-map-title" className="text-section-title mb-1">
              Find people around Da Nang
              <span
                className="ml-2 italic text-muted font-normal text-base"
                style={{ letterSpacing: '0.02em' }}
                aria-hidden="true"
              >
                bản đồ
              </span>
            </h2>
            <p className="text-sm text-muted">
              {buddies.length > 0
                ? `${buddies.length} ${buddies.length === 1 ? 'person' : 'people'} in Da Nang — local buddies and travelers near you.`
                : 'Loading Da Nang people…'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setShareLocation((v) => !v)
                if (!shareLocation && !hasGpsFix) {
                  // Ask for the GPS fix so the self-marker appears
                  // immediately after the user opts in.
                  if (typeof navigator !== 'undefined' && navigator.geolocation) {
                    navigator.geolocation.getCurrentPosition(
                      (pos) => {
                        setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude })
                        setHasGpsFix(true)
                      },
                      () => {
                        /* user denied — that's fine, the share
                           still publishes via watchPosition later */
                      },
                      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 },
                    )
                  }
                }
              }}
              className={`inline-flex items-center gap-1 h-9 px-3 text-sm font-medium rounded-sm border ${
                shareLocation
                  ? 'bg-primary text-paper border-primary hover:bg-primary-hover'
                  : 'bg-transparent text-ink border-border-strong hover:bg-paper'
              }`}
              title="Share your live location with other tourists (no data is saved)"
            >
              <MapPin size={14} aria-hidden="true" />
              {shareLocation ? 'Sharing live' : 'Share my location'}
            </button>
          </div>
        </div>
        <div className="h-[420px] lg:h-[520px]">
          <MapView
            userLocation={userLocation}
            height="100%"
            hasGpsFix={hasGpsFix || selfGranted}
            onSelectBuddy={(id) => { setSelectedMapId(id); setExpandedBuddyId(id) }}
            liveLocations={liveLocations}
            selfLiveOverride={selfGranted || shareLocation}
            selfUserId={currentUserId}
          />
          {selectedBuddy ? (
            <div className="absolute bottom-3 left-3 right-3 md:left-auto md:right-3 md:w-80 bg-surface border border-border rounded-sm p-4 z-aside">
              <button
                type="button"
                onClick={() => setSelectedMapId(null)}
                aria-label="Close popup"
                className="absolute top-2 right-2 inline-flex items-center justify-center w-6 h-6 text-muted hover:text-ink"
              >
                <X size={16} aria-hidden="true" />
              </button>
              <h3 className="text-sm font-semibold pr-6">{selectedBuddy.full_name}</h3>
              <p className="text-xs text-muted mt-1">
                <MapPin size={12} className="inline mr-1" aria-hidden="true" />
                {selectedBuddy.location_city}
                <span
                  className={`role-tag ml-2 ${
                    selectedBuddy.role === 'buddy' ? 'role-tag-buddy' : 'role-tag-traveler'
                  }`}
                >
                  {selectedBuddy.role === 'buddy' ? 'Buddy' : 'Traveler'}
                </span>
              </p>
              <p className="text-xs text-muted mt-1">
                <Star size={12} className="inline mr-1" aria-hidden="true" />
                {selectedBuddy.role === 'buddy' && selectedBuddy.rating_avg
                  ? `${selectedBuddy.rating_avg.toFixed(1)} · ${selectedBuddy.languages.slice(0, 2).join(', ')}`
                  : (selectedBuddy.languages.slice(0, 2).join(', ') || 'Traveler in Da Nang')}
              </p>
              <Link
                href={selectedBuddy.role === 'buddy' ? `/buddies/${selectedBuddy.id}` : `/tourists/${selectedBuddy.id}`}
                className="inline-flex items-center justify-center mt-2 h-9 px-3 text-sm font-medium rounded-sm bg-primary text-paper border border-primary hover:bg-primary-hover w-full"
              >
                View profile
              </Link>
              {selectedBuddy.role === 'buddy' && selectedBuddy.specialties.length > 0 ? (
                <Link
                  href={`/search?tag=${encodeURIComponent(selectedBuddy.specialties[0])}`}
                  className="inline-flex items-center justify-center mt-2 h-9 px-3 text-sm font-medium rounded-sm bg-transparent text-ink border border-border-strong hover:bg-paper w-full"
                >
                  Find similar buddies
                </Link>
              ) : null}
            </div>
          ) : null}
        </div>
      </section>

      {/* Recommend list — buddies + tourists (role badge on each row). */}
      <section aria-label="People in Da Nang">
        {loadError ? (
          <div className="alert alert-error mb-4" role="alert">
            <span>{loadError}</span>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="ml-auto inline-flex items-center h-8 px-3 text-xs font-medium rounded-sm bg-transparent text-ink border border-border-strong hover:bg-paper"
            >
              Retry
            </button>
          </div>
        ) : null}
        {loading ? (
          <div className="text-center py-16">
            <div className="loading-spinner mx-auto" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="border border-border rounded-sm p-12 text-center bg-surface">
            <Users size={48} className="mx-auto text-subtle mb-3" aria-hidden="true" />
            <h3 className="text-lg font-semibold mb-2">
              {activeFilter === 'saved'
                ? 'You have not saved any buddies yet'
                : 'No people found in Da Nang'}
            </h3>
            <p className="text-sm text-muted mb-4">
              {activeFilter === 'saved'
                ? 'Tap Save on a buddy to keep them here for next time.'
                : 'Try removing filters or searching for Da Nang areas like My Khe Beach, Han River, or Son Tra.'}
            </p>
            <Link
              href="/browse"
              className="inline-flex items-center justify-center h-9 px-3 text-sm font-medium rounded-sm bg-primary text-paper border border-primary hover:bg-primary-hover"
            >
              See all Da Nang people
            </Link>
          </div>
        ) : (
          <ul className="divide-y divide-border border border-border rounded-sm bg-surface">
            {filtered.map((b) => {
              const expanded = expandedBuddyId === b.id
              const dist = haversineKm(userLocation, { lat: b.latitude, lng: b.longitude })
              const saved = savedBuddies.includes(b.id)
              const isBuddy = b.role === 'buddy'
              const profileHref = isBuddy ? `/buddies/${b.id}` : `/tourists/${b.id}`
              const tags = isBuddy ? b.specialties : b.interests
              return (
                <li key={b.id}>
                  <button
                    type="button"
                    onClick={() => setExpandedBuddyId(expanded ? null : b.id)}
                    onMouseEnter={() => setSelectedMapId(b.id)}
                    aria-expanded={expanded}
                    className="w-full px-6 py-4 flex items-center gap-4 text-left hover:bg-paper transition-colors duration-150"
                  >
                    <span
                      className="flex items-center justify-center w-10 h-10 rounded-full text-sm font-semibold text-paper shrink-0"
                      style={{ backgroundColor: isBuddy ? avatarColor(b.id) : '#0F0F0F' }}
                      aria-hidden="true"
                    >
                      {b.full_name.charAt(0)}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-ink truncate flex items-center gap-1.5">
                        <span>{b.full_name}</span>
                        <span
                          className={`role-tag shrink-0 ${
                            isBuddy ? 'role-tag-buddy' : 'role-tag-traveler'
                          }`}
                          aria-label={isBuddy ? 'Local buddy' : 'Traveler'}
                        >
                          {isBuddy ? 'Buddy' : 'Traveler'}
                        </span>
                        {matchScoreMap.get(b.id) ? (
                          <span
                            className="badge badge-info text-[10px]"
                            aria-label={`${matchScoreMap.get(b.id)} keyword matches`}
                          >
                            {matchScoreMap.get(b.id)} matches
                          </span>
                        ) : null}
                      </p>
                      <p className="text-xs text-muted truncate">
                        <MapPin size={12} className="inline mr-1" aria-hidden="true" />
                        {b.location_city} · {dist.toFixed(1)} km away
                        {b.nationality ? <> · {b.nationality}</> : null}
                      </p>
                    </div>
                    <div className="hidden md:flex flex-wrap gap-1 max-w-[200px]">
                      {tags.slice(0, 3).map((tag) => (
                        <span key={tag} className="badge badge-neutral text-xs">
                          {tag}
                        </span>
                      ))}
                    </div>
                    <div className="text-right hidden sm:block">
                      {isBuddy ? (
                        <>
                          <p className="text-sm font-medium">
                            <Star size={12} className="inline mr-1 text-warning" aria-hidden="true" />
                            {b.rating_avg ? b.rating_avg.toFixed(1) : '—'}
                          </p>
                          <p className="text-xs text-muted">{b.rating_count} reviews</p>
                        </>
                      ) : (
                        <>
                          <p className="text-sm font-medium text-muted">—</p>
                          <p className="text-xs text-muted">traveler</p>
                        </>
                      )}
                    </div>
                    <ChevronDown
                      size={18}
                      className={`text-muted transition-transform duration-150 ${expanded ? 'rotate-180' : ''}`}
                      aria-hidden="true"
                    />
                  </button>

                  {expanded ? (
                    <div className="px-6 pb-6 pt-2 bg-paper border-t border-border">
                      {b.bio ? (
                        <p className="text-sm text-ink leading-relaxed mb-4 max-w-prose">{b.bio}</p>
                      ) : null}
                      <dl className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                        <div>
                          <dt className="text-eyebrow text-muted mb-2">Languages</dt>
                          <dd className="flex flex-wrap gap-1">
                            {b.languages.map((l) => (
                              <span key={l} className="lang-chip">{l}</span>
                            ))}
                          </dd>
                        </div>
                        {isBuddy ? (
                          <div>
                            <dt className="text-eyebrow text-muted mb-2">Specialties</dt>
                            <dd className="flex flex-wrap gap-1">
                              {b.specialties.map((s) => (
                                <span key={s} className="badge badge-neutral text-xs">{s}</span>
                              ))}
                            </dd>
                          </div>
                        ) : (
                          <div>
                            <dt className="text-eyebrow text-muted mb-2">Interests</dt>
                            <dd className="flex flex-wrap gap-1">
                              {b.interests.map((i) => (
                                <span key={i} className="badge badge-neutral text-xs">{i}</span>
                              ))}
                            </dd>
                          </div>
                        )}
                        {isBuddy && b.hourly_rate !== null ? (
                          <div>
                            <dt className="text-eyebrow text-muted mb-2">
                              Hourly rate
                              <span
                                className="ml-1 italic font-normal"
                                style={{ letterSpacing: '0.02em' }}
                                aria-hidden="true"
                              >
                                giá theo giờ
                              </span>
                            </dt>
                            <dd>
                              <strong
                                className="text-ink"
                                style={{
                                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                                  fontVariantNumeric: 'tabular-nums',
                                  letterSpacing: '-0.01em',
                                }}
                              >
                                ${Number(b.hourly_rate).toFixed(0)} USD / hour
                              </strong>
                              <OnlineIndicator userId={b.id} className="mt-2" />
                            </dd>
                          </div>
                        ) : !isBuddy ? (
                          <div>
                            <dt className="text-eyebrow text-muted mb-2">
                              Travel style
                              <span
                                className="ml-1 italic font-normal"
                                style={{ letterSpacing: '0.02em' }}
                                aria-hidden="true"
                              >
                                phong cách
                              </span>
                            </dt>
                            <dd className="text-sm text-ink">
                              {(b as BuddyItem).nationality || 'Traveler in Da Nang'}
                            </dd>
                          </div>
                        ) : null}
                      </dl>
                      <div className="flex flex-wrap gap-2">
                        {isBuddy ? (
                          <button
                            type="button"
                            onClick={() => toggleSave(b.id)}
                            aria-pressed={saved}
                            className={`inline-flex items-center gap-1 h-9 px-3 text-sm font-medium rounded-sm border ${
                              saved
                                ? 'bg-primary-bg text-primary border-primary-bg'
                                : 'bg-transparent text-ink border-border-strong hover:bg-surface'
                            }`}
                          >
                            <Heart
                              size={14}
                              className={saved ? 'fill-primary text-primary' : ''}
                              aria-hidden="true"
                            />
                            {saved ? 'Saved' : 'Save'}
                          </button>
                        ) : null}
                        <Link
                          href={profileHref}
                          className="inline-flex items-center justify-center h-9 px-3 text-sm font-medium rounded-sm bg-primary text-paper border border-primary hover:bg-primary-hover"
                        >
                          View profile
                        </Link>
                        {isBuddy && b.specialties.length > 0 ? (
                          <Link
                            href={`/search?tag=${encodeURIComponent(b.specialties[0])}`}
                            className="inline-flex items-center justify-center h-9 px-3 text-sm font-medium rounded-sm bg-transparent text-ink border border-border-strong hover:bg-surface"
                          >
                            Find similar
                          </Link>
                        ) : null}
                        <Link
                          href={`/chat?buddy=${b.id}`}
                          className="inline-flex items-center gap-1 h-9 px-3 text-sm font-medium rounded-sm bg-transparent text-ink border border-border-strong hover:bg-surface"
                        >
                          <MessageCircle size={14} aria-hidden="true" />
                          Message
                        </Link>
                      </div>
                    </div>
                  ) : null}
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}

function avatarColor(seed: string): string {
  let hash = 0
  for (let i = 0; i < seed.length; i++) {
    hash = seed.charCodeAt(i) + ((hash << 5) - hash)
  }
  // Brand-aligned flat palette. Avoids neutral greys so avatars stay
  // visible in dark mode (the dark paper colour is ~#0A0A0C).
  const palette = ['#FF6B35', '#92400E', '#166534', '#075985', '#7C2D12', '#5B21B6']
  const idx = Math.abs(hash) % palette.length
  return palette[idx]
}

export default function BrowsePage() {
  return (
    <Suspense fallback={
      <div className="container-page py-16 text-center"><div className="loading-spinner mx-auto" /></div>
    }>
      <BrowseContent />
    </Suspense>
  )
}
