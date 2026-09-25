'use client'

import { useEffect, useState, useMemo, Suspense } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import dynamic from 'next/dynamic'
import { createClient } from '@/utils/supabase/auth'
import './browse.css'

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
] as const

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
  const [selectedMapId, setSelectedMapId] = useState<string | null>(null)
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number }>({ lat: 16.0544, lng: 108.2023 })

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
          .from('buddies')
          .select('id, location_city, latitude, longitude, languages, specialties, hourly_rate, is_available, bio, profile:profiles(full_name, is_online, avatar_url)')
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
        console.error('Browse load failed:', err)
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
    }
    return list
  }, [buddies, destinationFilter, languageFilter, activeFilter, userLocation])

  const selectedBuddy = filtered.find((b) => b.id === selectedMapId) ?? null

  function toggleSave(id: string) {
    setSavedBuddies(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  return (
    <div className="buddies-page">
      {/* Header */}
      <div className="buddies-header">
        <div className="header-left">
          <h1>{hasSearch ? 'Search Results' : 'Find Local Buddies in Da Nang'}</h1>
          <p>
            {loading ? 'Loading...' : `${filtered.length} ${filtered.length === 1 ? 'buddy' : 'buddies'}${destinationFilter ? ` for "${destinationFilter}"` : ''}`}
          </p>
        </div>
        <div className="header-actions-inline">
          <Link href="/map" className="btn btn-outline btn-sm">🗺️ Open Map</Link>
        </div>
      </div>

      <div className="buddies-list-view">
        {/* Filter chips bar */}
        <div className="grid-filters">
          {hasSearch && (
            <div className="search-results-note">
              <div>
                <span className="search-results-label">Showing results for</span>
                <strong>{destinationFilter || 'Da Nang'}</strong>
                {languageFilter && <span>Language: {languageFilter}</span>}
              </div>
              <Link href="/tourist/browse" className="clear-search-link">Clear search</Link>
            </div>
          )}
          <div className="filter-row">
            <input
              className="form-input search-input"
              placeholder="Search Da Nang buddies by name, area, or interest"
              value={destinationFilter}
              onChange={(e) => setDestinationFilter(e.target.value)}
            />
            <select
              className="form-input form-select search-select"
              value={languageFilter}
              onChange={(e) => setLanguageFilter(e.target.value)}
            >
              <option value="">All languages</option>
              {LANGUAGES.map((l) => (
                <option key={l} value={l}>{l}</option>
              ))}
            </select>
          </div>
          <div className="filter-chips">
            {FILTERS.map((filter) => (
              <button
                key={filter.id}
                className={`filter-chip ${activeFilter === filter.id ? 'active' : ''}`}
                onClick={() => setActiveFilter(filter.id)}
              >
                {filter.label}
              </button>
            ))}
          </div>
        </div>

        {/* Map section */}
        <section className="find-buddies-map">
          <div className="buddy-map-copy">
            <span>Buddy Map</span>
            <h2>Find buddies around you</h2>
            <p>Hover a marker or click a buddy below to see their location in Da Nang.</p>
          </div>
          <div className="buddy-leaflet-map">
            <MapView
              userLocation={userLocation}
              height={340}
              onSelectBuddy={(id) => { setSelectedMapId(id); setExpandedBuddyId(id) }}
            />
            {selectedBuddy && (
              <div className="buddy-map-popup">
                <button type="button" onClick={() => setSelectedMapId(null)} aria-label="Close">✕</button>
                <h3>{selectedBuddy.full_name}</h3>
                <p>📍 {selectedBuddy.location_city}</p>
                <span>⭐ {selectedBuddy.rating_avg ? selectedBuddy.rating_avg.toFixed(1) : '—'} · {selectedBuddy.languages.slice(0, 2).join(', ')}</span>
                <Link href={`/tourist/buddy/${selectedBuddy.id}`} className="btn btn-primary btn-sm btn-block mt-sm">View profile</Link>
              </div>
            )}
          </div>
        </section>

        {/* Buddy accordion list */}
        {loading ? (
          <div className="text-center py-xl"><div className="loading-spinner mx-auto" /></div>
        ) : filtered.length === 0 ? (
          <div className="empty-results">
            <h3>No buddies found</h3>
            <p>Try removing filters or searching for Da Nang areas like My Khe Beach, Han River, or Son Tra.</p>
            <Link href="/tourist/browse" className="grid-btn">See all buddies</Link>
          </div>
        ) : (
          <div className="buddy-accordion-list">
            {filtered.map((b) => {
              const expanded = expandedBuddyId === b.id
              const dist = haversineKm(userLocation, { lat: b.latitude, lng: b.longitude })
              const saved = savedBuddies.includes(b.id)
              return (
                <article key={b.id} className={`buddy-list-card ${expanded ? 'expanded' : ''}`}>
                  <button
                    type="button"
                    className="buddy-list-summary"
                    onClick={() => setExpandedBuddyId(expanded ? null : b.id)}
                    onMouseEnter={() => setSelectedMapId(b.id)}
                    aria-expanded={expanded}
                  >
                    <span className="list-avatar">{b.full_name.charAt(0)}</span>
                    <span className="list-main">
                      <span className="list-name">{b.full_name}</span>
                      <span className="list-location">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
                        </svg>
                        {b.location_city} · {dist.toFixed(1)} km
                      </span>
                    </span>
                    <span className="list-tags">
                      {b.specialties.slice(0, 3).map((tag) => (
                        <span key={tag} className="list-tag">{tag}</span>
                      ))}
                    </span>
                    <span className="list-meta">
                      <span>⭐ {b.rating_avg ? b.rating_avg.toFixed(1) : '—'}</span>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{b.rating_count} reviews</span>
                    </span>
                    <span className="list-chevron">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M6 9l6 6 6-6"/>
                      </svg>
                    </span>
                  </button>

                  <div className="buddy-dropdown-panel">
                    {b.bio && <p className="list-bio">{b.bio}</p>}
                    <div className="list-detail-grid">
                      <div>
                        <span className="detail-label">Languages</span>
                        <div className="lang-list">
                          {b.languages.map((l) => (
                            <span key={l} className="lang-chip">{l}</span>
                          ))}
                        </div>
                      </div>
                      <div>
                        <span className="detail-label">Specialties</span>
                        <div className="buddy-interests">
                          {b.specialties.map((s) => (
                            <span key={s} className="interest-chip">{s}</span>
                          ))}
                        </div>
                      </div>
                      {b.hourly_rate !== null && (
                        <div>
                          <span className="detail-label">Rate</span>
                          <strong>${Number(b.hourly_rate).toFixed(0)}/hour</strong>
                          {b.is_online && (
                            <div style={{ marginTop: 6 }}>
                              <span className="badge badge-success">Active now</span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="list-actions">
                      <button
                        type="button"
                        className={`save-buddy-btn ${saved ? 'saved' : ''}`}
                        onClick={() => toggleSave(b.id)}
                      >
                        {saved ? '✓ Saved' : '♡ Save'}
                      </button>
                      <Link href={`/tourist/buddy/${b.id}`} className="grid-btn">
                        View profile
                      </Link>
                      <Link href={`/chat?buddy=${b.id}`} className="connect-list-btn">
                        💬 Message
                      </Link>
                    </div>
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

export default function BrowsePage() {
  return (
    <Suspense fallback={
      <div className="container py-xl text-center"><div className="loading-spinner mx-auto" /></div>
    }>
      <BrowseContent />
    </Suspense>
  )
}
