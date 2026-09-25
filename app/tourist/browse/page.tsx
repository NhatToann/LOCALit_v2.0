'use client'

import { useEffect, useState, useMemo, Suspense } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import dynamic from 'next/dynamic'
import { createClient } from '@/utils/supabase/auth'

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
  trips_completed: number | null
  bio: string | null
  is_online: boolean
  avatar_url: string | null
}

const FILTERS = [
  { id: 'all', label: 'Tất cả' },
  { id: 'top-rated', label: 'Đánh giá cao' },
  { id: 'near-me', label: 'Gần tôi' },
  { id: 'available', label: 'Đang nhận khách' },
] as const

const LANGUAGES = ['Tiếng Anh', 'Tiếng Việt', 'Tiếng Nhật', 'Tiếng Hàn', 'Tiếng Pháp', 'Tiếng Trung', 'Tiếng Nga']

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
      const supabase = createClient()
      const { data } = await supabase
        .from('buddies')
        .select('id, location_city, latitude, longitude, languages, specialties, hourly_rate, is_available, profile:profiles(full_name, is_online, avatar_url)')
        .not('latitude', 'is', null)
        .not('longitude', 'is', null)

      if (!data) {
        setLoading(false)
        return
      }

      const buddyIds = data.map((b: any) => b.id)
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
            trips_completed: 0,
            bio: null,
            is_online: b.profile?.is_online ?? false,
            avatar_url: b.profile?.avatar_url ?? null,
          }
        })
      setBuddies(mapped)
      setLoading(false)
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

  return (
    <div className="container py-xl">
      <div className="flex-between mb-lg" style={{ flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 className="text-3xl">{hasSearch ? 'Kết quả tìm kiếm' : 'Tìm Local Buddy'}</h1>
          <p className="text-muted mt-sm">
            {loading ? 'Đang tải...' : `${filtered.length} buddy${filtered.length !== 1 ? 's' : ''}${destinationFilter ? ` cho "${destinationFilter}"` : ''}`}
          </p>
        </div>
      </div>

      {/* Filters bar */}
      <div className="card mb-lg">
        <div className="card-body">
          <div className="filter-row" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label" htmlFor="dest">Điểm đến / từ khóa</label>
              <input
                id="dest"
                className="form-input"
                placeholder="Da Nang, Hoi An, Hanoi..."
                value={destinationFilter}
                onChange={(e) => setDestinationFilter(e.target.value)}
                maxLength={80}
              />
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label" htmlFor="lang">Ngôn ngữ</label>
              <select
                id="lang"
                className="form-input form-select"
                value={languageFilter}
                onChange={(e) => setLanguageFilter(e.target.value)}
              >
                <option value="">Tất cả</option>
                {LANGUAGES.map((l) => (
                  <option key={l} value={l}>{l}</option>
                ))}
              </select>
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Sắp xếp</label>
              <div className="chip-row">
                {FILTERS.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setActiveFilter(f.id)}
                    className={`chip ${activeFilter === f.id ? 'active' : ''}`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
          {(destinationFilter || languageFilter) && (
            <div className="mt-md flex gap-sm" style={{ alignItems: 'center' }}>
              <span className="text-sm text-muted">Đang lọc:</span>
              {destinationFilter && (
                <span className="badge badge-primary">📍 {destinationFilter}</span>
              )}
              {languageFilter && (
                <span className="badge badge-info">🗣️ {languageFilter}</span>
              )}
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => { setDestinationFilter(''); setLanguageFilter('') }}
              >
                ✕ Xóa bộ lọc
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="browse-grid">
        {/* Map */}
        <div className="browse-map card">
          <MapView userLocation={userLocation} height={520} onSelectBuddy={(id) => { setSelectedMapId(id); setExpandedBuddyId(id) }} />
          {selectedBuddy && (
            <div className="map-popup-card">
              <button className="map-popup-close" onClick={() => setSelectedMapId(null)} aria-label="Đóng">✕</button>
              <h4>{selectedBuddy.full_name}</h4>
              <p className="text-sm text-muted">{selectedBuddy.location_city}</p>
              <p className="text-sm">⭐ {selectedBuddy.rating_avg ? selectedBuddy.rating_avg.toFixed(1) : '—'} · {selectedBuddy.languages.join(', ')}</p>
              <Link href={`/tourist/buddy/${selectedBuddy.id}`} className="btn btn-primary btn-sm btn-block mt-sm">Xem hồ sơ</Link>
            </div>
          )}
        </div>

        {/* Buddy list */}
        <div className="browse-list">
          {loading ? (
            <div className="text-center py-xl"><div className="loading-spinner mx-auto" /></div>
          ) : filtered.length === 0 ? (
            <div className="empty-state card">
              <div style={{ fontSize: 48 }}>🔍</div>
              <h3>Không tìm thấy buddy</h3>
              <p>Thử bỏ bộ lọc hoặc đổi từ khóa khác.</p>
            </div>
          ) : (
            filtered.map((b) => {
              const expanded = expandedBuddyId === b.id
              const dist = haversineKm(userLocation, { lat: b.latitude, lng: b.longitude })
              return (
                <article key={b.id} className={`card buddy-card-item ${expanded ? 'expanded' : ''}`}>
                  <button
                    type="button"
                    className="buddy-summary"
                    onClick={() => setExpandedBuddyId(expanded ? null : b.id)}
                    onMouseEnter={() => setSelectedMapId(b.id)}
                    aria-expanded={expanded}
                  >
                    <span className="avatar avatar-lg">{b.full_name.charAt(0)}</span>
                    <span className="buddy-summary-main">
                      <span className="buddy-summary-name">{b.full_name}</span>
                      <span className="buddy-summary-loc">
                        📍 {b.location_city} · {dist.toFixed(1)} km
                      </span>
                      <span className="buddy-summary-tags">
                        {b.specialties.slice(0, 2).map((t) => (
                          <span key={t} className="tag">{t}</span>
                        ))}
                      </span>
                    </span>
                    <span className="buddy-summary-meta">
                      <span className="buddy-summary-rating">
                        ⭐ {b.rating_avg ? b.rating_avg.toFixed(1) : '—'}
                      </span>
                      {b.is_online && <span className="badge badge-success">Online</span>}
                    </span>
                  </button>
                  {expanded && (
                    <div className="buddy-details">
                      <div className="buddy-details-grid">
                        <div>
                          <span className="detail-label">Ngôn ngữ</span>
                          <div className="lang-list">
                            {b.languages.map((l) => (
                              <span key={l} className="lang-chip">{l}</span>
                            ))}
                          </div>
                        </div>
                        <div>
                          <span className="detail-label">Chuyên môn</span>
                          <div className="lang-list">
                            {b.specialties.map((s) => (
                              <span key={s} className="lang-chip">{s}</span>
                            ))}
                          </div>
                        </div>
                        {b.hourly_rate && b.hourly_rate > 0 && (
                          <div>
                            <span className="detail-label">Phí</span>
                            <strong>${Number(b.hourly_rate).toFixed(0)}/giờ</strong>
                          </div>
                        )}
                      </div>
                      <div className="buddy-actions">
                        <Link href={`/tourist/buddy/${b.id}`} className="btn btn-primary btn-sm">Xem hồ sơ</Link>
                        <Link href={`/chat?buddy=${b.id}`} className="btn btn-outline btn-sm">💬 Nhắn tin</Link>
                      </div>
                    </div>
                  )}
                </article>
              )
            })
          )}
        </div>
      </div>

      <style>{browseCss}</style>
    </div>
  )
}

const browseCss = `
.chip {
  padding: 6px 12px;
  border-radius: 9999px;
  border: 1px solid var(--border-color);
  background: var(--bg-white);
  font-size: var(--font-size-xs);
  font-weight: 500;
  cursor: pointer;
  transition: all var(--transition-fast);
}
.chip:hover { border-color: var(--primary); color: var(--primary); }
.chip.active {
  background: var(--primary);
  color: var(--text-light);
  border-color: var(--primary);
}
.chip-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
  min-height: 48px;
  padding: 8px 0;
}
.browse-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-lg);
}
@media (max-width: 1024px) {
  .browse-grid { grid-template-columns: 1fr; }
}
.browse-map {
  position: sticky;
  top: calc(var(--header-height) + 16px);
  height: fit-content;
  overflow: hidden;
  padding: 0;
}
.map-popup-card {
  position: absolute;
  bottom: 16px;
  left: 16px;
  right: 16px;
  max-width: 320px;
  background: white;
  border-radius: var(--border-radius-lg);
  box-shadow: var(--shadow-lg);
  padding: var(--space-md);
  z-index: 500;
}
.map-popup-close {
  position: absolute;
  top: 8px;
  right: 8px;
  background: transparent;
  border: none;
  cursor: pointer;
  font-size: 16px;
  width: 28px;
  height: 28px;
  border-radius: 50%;
}
.map-popup-close:hover { background: var(--bg-gray); }
.buddy-card-item { margin-bottom: var(--space-md); transition: all var(--transition-fast); }
.buddy-card-item:hover { box-shadow: var(--shadow-hover); }
.buddy-summary {
  width: 100%;
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: var(--space-md);
  padding: var(--space-md);
  background: transparent;
  border: none;
  text-align: left;
  cursor: pointer;
  align-items: center;
}
.buddy-summary-main {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}
.buddy-summary-name {
  font-weight: 600;
  font-size: var(--font-size-base);
}
.buddy-summary-loc {
  font-size: var(--font-size-xs);
  color: var(--text-muted);
}
.buddy-summary-tags {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
}
.buddy-summary-meta {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
}
.buddy-summary-rating {
  font-weight: 600;
  color: var(--accent);
  font-size: var(--font-size-sm);
}
.buddy-details {
  padding: 0 var(--space-md) var(--space-md);
  border-top: 1px solid var(--border-color);
  padding-top: var(--space-md);
}
.buddy-details-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: var(--space-md);
  margin-bottom: var(--space-md);
}
.detail-label {
  display: block;
  font-size: var(--font-size-xs);
  text-transform: uppercase;
  letter-spacing: .6px;
  color: var(--text-muted);
  font-weight: 600;
  margin-bottom: 6px;
}
.lang-list {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.buddy-actions {
  display: flex;
  gap: var(--space-sm);
  justify-content: flex-end;
}
.buddy-card-item.expanded {
  box-shadow: var(--shadow-md);
  border-left: 3px solid var(--primary);
}
`

export default function BrowsePage() {
  return (
    <Suspense fallback={
      <div className="container py-xl text-center"><div className="loading-spinner mx-auto" /></div>
    }>
      <BrowseContent />
    </Suspense>
  )
}
