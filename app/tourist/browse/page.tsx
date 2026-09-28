'use client'

import { useEffect, useState, useMemo, Suspense, useCallback } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import dynamic from 'next/dynamic'
import { createClient } from '@/utils/supabase/auth'
import { useLiveUserLocations } from '@/hooks/useLiveUserLocations'
import { Map as MapIcon, MapPin, Star, ChevronDown, Heart, MessageCircle, X, Search, Users } from 'lucide-react'

const MapView = dynamic(() => import('@/components/map/MapView'), { ssr: false })

interface BuddyItem {
  id: string
  full_name: string
  location_city: string
  latitude: number
  longitude: number
  languages: string[]
  specialties: string[]
  hourly_rate: number | null
  rating_avg: number | null
  rating_count: number
  bio: string | null
  is_online: boolean
  avatar_url: string | null
}

const FILTERS = [
    { id: 'all', label: 'All' },
    { id: 'top-rated', label: 'Top Rated' },
    { id: 'near-me', label: 'Near Me' },
    { id: 'available', label: 'Available Now' },
    { id: 'saved', label: 'Saved' },
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
  const [shareLocation, setShareLocation] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  // Hydrate saved buddies from localStorage on mount
  useEffect(() => {
    setSavedBuddies(readSaved())
    setSavedHydrated(true)
  }, [])

  // Persist on every change (after hydration) so we don't overwrite with []
  useEffect(() => {
    if (!savedHydrated) return
    try {
      window.localStorage.setItem(SAVED_KEY, JSON.stringify(savedBuddies))
    } catch {
      /* quota or private mode — silently ignore */
    }
  }, [savedBuddies, savedHydrated])

  const toggleSave = useCallback((id: string) => {
    setSavedBuddies((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }, [])

  const { liveLocations, selfGranted, selfDenied } = useLiveUserLocations({
    enabled: shareLocation,
  })

  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return
    navigator.geolocation.getCurrentPosition(
      (pos) => setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => {},
      { enableHighAccuracy: true, timeout: 5000 }
    )
  }, [])

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const supabase = createClient()
        const { data } = await supabase
          // Public discovery: read rounded coordinates from safe_buddies so anon
          // callers (and any auth caller with stale cookies) actually see pins.
          .from('safe_buddies')
          .select('id, location_city, latitude, longitude, languages, specialties, hourly_rate, is_available, profile:safe_profiles(full_name, avatar_url, is_online)')
          .eq('location_city', 'Da Nang')
          .not('latitude', 'is', null)
          .not('longitude', 'is', null)

        if (!data) {
          setBuddies([])
          setLoading(false)
          return
        }

        const buddyIds = (data as any[]).map((b) => b.id)
        const { data: reviews } = await supabase
          .from('reviews')
          .select('reviewee_id, rating')
          .in('reviewee_id', buddyIds)

        const ratingMap = new Map<string, { sum: number; count: number }>()
        for (const r of reviews ?? []) {
          const cur = ratingMap.get(r.reviewee_id) ?? { sum: 0, count: 0 }
          cur.sum += r.rating
          cur.count += 1
          ratingMap.set(r.reviewee_id, cur)
        }

        const mapped: BuddyItem[] = (data as any[])
          .filter((b) => b.latitude !== null && b.longitude !== null)
          .map((b) => {
            const r = ratingMap.get(b.id)
            return {
              id: b.id,
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
            }
          })
        setBuddies(mapped)
      } catch (err) {
        setLoadError((err as Error).message || 'Could not load buddies.')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const filtered = useMemo(() => {
    const normalizedDest = destinationFilter.trim().toLowerCase()
    let list = buddies
    if (normalizedDest) {
      list = list.filter((b) => {
        const hay = [
          b.full_name,
          b.location_city,
          b.bio ?? '',
          ...b.specialties,
          ...b.languages,
        ].join(' ').toLowerCase()
        return hay.includes(normalizedDest)
      })
    }
    if (languageFilter) {
      list = list.filter((b) => b.languages.some((l) => l.toLowerCase().includes(languageFilter.toLowerCase())))
    }
    list = [...list]
    if (activeFilter === 'top-rated') {
      list.sort((a, b) => (b.rating_avg ?? 0) - (a.rating_avg ?? 0))
    } else if (activeFilter === 'near-me') {
      list.sort((a, b) => haversineKm(userLocation, { lat: a.latitude, lng: a.longitude }) - haversineKm(userLocation, { lat: b.latitude, lng: b.longitude }))
    } else if (activeFilter === 'available') {
      list = list.filter((b) => b.is_online)
    } else if (activeFilter === 'saved') {
      list = list.filter((b) => savedBuddies.includes(b.id))
    }
    return list
  }, [buddies, destinationFilter, languageFilter, activeFilter, userLocation, savedBuddies])

  const selectedBuddy = filtered.find((b) => b.id === selectedMapId) ?? null

  return (
    <div className="container-page py-8">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-page-title">
            {hasSearch ? 'Search results' : 'Find local buddies in Da Nang'}
          </h1>
          <p className="text-sm text-muted mt-1">
            {loading ? 'Loading Da Nang buddies...' : `${filtered.length} ${filtered.length === 1 ? 'buddy' : 'buddies'}${destinationFilter ? ` for "${destinationFilter}"` : ''}`}
          </p>
        </div>
        <Link
          href="/map"
          className="inline-flex items-center gap-2 h-9 px-3 text-sm font-medium rounded-sm bg-transparent text-ink border border-border-strong hover:bg-paper"
        >
          <MapIcon size={16} aria-hidden="true" />
          Open map
        </Link>
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
            <Link href="/tourist/browse" className="text-primary hover:underline text-sm">
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
                className={`h-8 px-3 text-sm font-medium rounded-pill border transition-colors duration-150 ${
                  active
                    ? 'bg-primary text-paper border-primary'
                    : 'bg-transparent text-muted border-border hover:text-ink hover:border-border-strong'
                }`}
              >
                {filter.label}
              </button>
            )
          })}
        </div>
      </section>

      {/* Map */}
      <section
        aria-label="Buddy map"
        className="mb-6 border border-border rounded-sm overflow-hidden bg-surface"
      >
        <div className="px-6 py-4 border-b border-border">
          <p className="text-eyebrow text-primary mb-1">Buddy map</p>
          <h2 className="text-lg font-semibold">Find buddies around Da Nang</h2>
          <p className="text-sm text-muted mt-1">
            Hover a marker or click a buddy below to see their location.
          </p>
        </div>
        <div className="relative h-[340px]">
          <button
            type="button"
            onClick={() => setShareLocation(v => !v)}
            className={`absolute top-3 right-3 z-10 inline-flex items-center gap-2 h-8 px-3 text-sm font-medium rounded-sm border ${
              shareLocation
                ? 'bg-primary text-paper border-primary'
                : 'bg-surface text-ink border-border-strong hover:bg-paper'
            }`}
            title="Share your live location with other tourists (no data is saved)"
          >
            <MapPin size={14} aria-hidden="true" />
            {shareLocation ? 'Sharing live' : 'Share my location'}
          </button>
          <MapView
            userLocation={userLocation}
            height={340}
            onSelectBuddy={(id) => { setSelectedMapId(id); setExpandedBuddyId(id) }}
            liveLocations={liveLocations}
            selfLiveOverride={selfGranted}
          />
          {selectedBuddy ? (
            <div className="absolute bottom-3 left-3 right-3 md:left-auto md:right-3 md:w-80 bg-surface border border-border rounded-sm p-4">
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
              </p>
              <p className="text-xs text-muted mt-1">
                <Star size={12} className="inline mr-1" aria-hidden="true" />
                {selectedBuddy.rating_avg ? selectedBuddy.rating_avg.toFixed(1) : '—'} · {selectedBuddy.languages.slice(0, 2).join(', ')}
              </p>
              <Link
                href={`/tourist/buddy/${selectedBuddy.id}`}
                className="inline-flex items-center justify-center mt-2 h-9 px-3 text-sm font-medium rounded-sm bg-primary text-paper border border-primary hover:bg-primary-hover w-full"
              >
                View profile
              </Link>
            </div>
          ) : null}
        </div>
      </section>

      {/* Buddy list */}
      <section aria-label="Buddies list">
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
                : 'No buddies found'}
            </h3>
            <p className="text-sm text-muted mb-4">
              {activeFilter === 'saved'
                ? 'Tap Save on a buddy to keep them here for next time.'
                : 'Try removing filters or searching for Da Nang areas like My Khe Beach, Han River, or Son Tra.'}
            </p>
            <Link
              href="/tourist/browse"
              className="inline-flex items-center justify-center h-9 px-3 text-sm font-medium rounded-sm bg-primary text-paper border border-primary hover:bg-primary-hover"
            >
              See all Da Nang buddies
            </Link>
          </div>
        ) : (
          <ul className="divide-y divide-border border border-border rounded-sm bg-surface">
            {filtered.map((b) => {
              const expanded = expandedBuddyId === b.id
              const dist = haversineKm(userLocation, { lat: b.latitude, lng: b.longitude })
              const saved = savedBuddies.includes(b.id)
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
                      className="flex items-center justify-center w-10 h-10 rounded-full text-sm font-semibold text-paper"
                      style={{ backgroundColor: avatarColor(b.id) }}
                      aria-hidden="true"
                    >
                      {b.full_name.charAt(0)}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-ink truncate">{b.full_name}</p>
                      <p className="text-xs text-muted truncate">
                        <MapPin size={12} className="inline mr-1" aria-hidden="true" />
                        {b.location_city} · {dist.toFixed(1)} km away
                      </p>
                    </div>
                    <div className="hidden md:flex flex-wrap gap-1 max-w-[200px]">
                      {b.specialties.slice(0, 3).map((tag) => (
                        <span key={tag} className="badge badge-neutral text-xs">
                          {tag}
                        </span>
                      ))}
                    </div>
                    <div className="text-right hidden sm:block">
                      <p className="text-sm font-medium">
                        <Star size={12} className="inline mr-1 text-warning" aria-hidden="true" />
                        {b.rating_avg ? b.rating_avg.toFixed(1) : '—'}
                      </p>
                      <p className="text-xs text-muted">{b.rating_count} reviews</p>
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
                        <div>
                          <dt className="text-eyebrow text-muted mb-2">Specialties</dt>
                          <dd className="flex flex-wrap gap-1">
                            {b.specialties.map((s) => (
                              <span key={s} className="badge badge-neutral text-xs">{s}</span>
                            ))}
                          </dd>
                        </div>
                        {b.hourly_rate !== null ? (
                          <div>
                            <dt className="text-eyebrow text-muted mb-2">Hourly rate</dt>
                            <dd>
                              <strong className="text-ink">${Number(b.hourly_rate).toFixed(0)} USD / hour</strong>
                              {b.is_online ? (
                                <p className="mt-2">
                                  <span className="badge badge-success">
                                    <span
                                      className="inline-block w-1.5 h-1.5 rounded-full bg-success mr-1"
                                      aria-hidden="true"
                                    />
                                    Active now
                                  </span>
                                </p>
                              ) : null}
                            </dd>
                          </div>
                        ) : null}
                      </dl>
                      <div className="flex flex-wrap gap-2">
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
                        <Link
                          href={`/tourist/buddy/${b.id}`}
                          className="inline-flex items-center justify-center h-9 px-3 text-sm font-medium rounded-sm bg-primary text-paper border border-primary hover:bg-primary-hover"
                        >
                          View profile
                        </Link>
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
