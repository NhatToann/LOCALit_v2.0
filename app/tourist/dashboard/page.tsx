'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { createClient } from '@/utils/supabase/auth'
import type { Profile, Trip, Connection } from '@/lib/types'
import { useLiveUserLocations } from '@/hooks/useLiveUserLocations'
import '../../dashboard.css'

const MapView = dynamic(() => import('@/components/map/MapView'), { ssr: false })

const DEFAULT_LOCATION = { lat: 16.0544, lng: 108.2023 }

export default function TouristDashboardPage() {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [trips, setTrips] = useState<Trip[]>([])
  const [connections, setConnections] = useState<Connection[]>([])
  const [buddies, setBuddies] = useState<any[]>([])
  const [reviewsCount, setReviewsCount] = useState(0)
  const [userLocation, setUserLocation] = useState(DEFAULT_LOCATION)
  const [hasGpsFix, setHasGpsFix] = useState(false)
  const [loading, setLoading] = useState(true)

  // Auto-enable live location sharing on dashboard mount.
  // We give the user a single permission prompt and, if granted, broadcast
  // their position so other signed-in tourists can see them on the map.
  const { liveLocations, selfGranted, selfDenied } = useLiveUserLocations({
    enabled: true,
  })

  // Track our real GPS position so the map pans/zooms to us once we get
  // the first fix. Falls back to Da Nang if permission is denied.
  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return

    const id = navigator.geolocation.watchPosition(
      (pos) => {
        setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude })
        setHasGpsFix(true)
      },
      () => {},
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 30000 },
    )
    return () => navigator.geolocation.clearWatch(id)
  }, [])

  useEffect(() => {
    load()
  }, [])

  async function load() {
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        setLoading(false)
        return
      }

      const [{ data: p }, { data: t }, { data: c }, { data: buddyPins }, { count: rCount }] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', user.id).maybeSingle<Profile>(),
        supabase
          .from('trips')
          .select('*, buddy:buddies(id, location_city, latitude, longitude, profile:profiles(full_name, is_online))')
          .eq('tourist_id', user.id)
          .order('created_at', { ascending: false }),
        supabase
          .from('connections')
          .select('*, buddy:buddies(*, profile:profiles(full_name, is_online))')
          .eq('tourist_id', user.id)
          .order('created_at', { ascending: false }),
        supabase
          .from('buddies')
          .select('id, location_city, latitude, longitude, is_available, profile:profiles(full_name, is_online)')
          .eq('location_city', 'Da Nang')
          .not('latitude', 'is', null)
          .not('longitude', 'is', null)
          .limit(20),
        supabase
          .from('reviews')
          .select('id', { count: 'exact', head: true })
          .eq('reviewer_id', user.id),
      ])

      setProfile(p ?? null)
      setTrips((t || []) as Trip[])
      setConnections((c || []) as Connection[])
      setBuddies(buddyPins ?? [])
      setReviewsCount(rCount ?? 0)
    } catch (err) {
      console.error('Tourist dashboard load failed:', err)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="container py-xl text-center">
        <div className="loading-spinner mx-auto" />
      </div>
    )
  }

  const accepted = connections.filter((c) => c.status === 'accepted')
  const pending = connections.filter((c) => c.status === 'pending')

  const stats = [
    { label: 'Trips', value: trips.length, icon: '🧳', color: '#FF6B35' },
    { label: 'Buddies connected', value: accepted.length, icon: '👥', color: '#28A745' },
    { label: 'Pending requests', value: pending.length, icon: '⏳', color: '#FFC107' },
    { label: 'Reviews sent', value: reviewsCount, icon: '⭐', color: '#FFB347' },
  ]

  const firstName = profile?.full_name?.split(' ')[0] || 'traveler'
  const nearbyCount = buddies.length + liveLocations.length

  return (
    <div className="dashboard-root">
      {/* Hero — greeting + primary CTA */}
      <section className="dashboard-hero dashboard-hero-tourist">
        <div className="dashboard-hero-bg" aria-hidden="true">
          <span className="dashboard-hero-blob blob-1" />
          <span className="dashboard-hero-blob blob-2" />
        </div>
        <div className="dashboard-hero-content">
          <div>
            <span className="dashboard-hero-eyebrow">🧳 Tourist dashboard</span>
            <h1 className="dashboard-hero-title">
              Welcome back, <span className="dashboard-hero-name">{firstName}</span>!
            </h1>
            <p className="dashboard-hero-sub">
              You have <strong>{pending.length}</strong> pending {pending.length === 1 ? 'request' : 'requests'} and{' '}
              <strong>{trips.length}</strong> {trips.length === 1 ? 'trip' : 'trips'} on your itinerary.
            </p>
          </div>
          <div className="dashboard-hero-cta">
            <Link href="/tourist/browse" className="btn btn-primary btn-lg">
              🔍 Find buddies
            </Link>
            <Link href="/tourist/trips/create" className="btn btn-outline btn-lg btn-on-dark">
              ＋ Plan a trip
            </Link>
          </div>
        </div>
      </section>

      {/* Featured map — full-width, above the fold. Tourists who grant
          location permission show up as a pulsing dot here, alongside the
          available buddies and other signed-in travellers who are sharing
          their live position. */}
      <section className="dashboard-featured-map">
        <div className="dashboard-featured-map-header">
          <div>
            <h2 className="dashboard-featured-map-title">
              📍 Who&apos;s around you right now
            </h2>
            <p className="dashboard-featured-map-sub">
              {nearbyCount > 0
                ? `${buddies.length} buddies + ${liveLocations.length} live traveller${liveLocations.length === 1 ? '' : 's'} on the map.`
                : 'Buddies and other travellers will appear here as they go online.'}
            </p>
          </div>
          <div className="dashboard-featured-map-actions">
            <ShareStatusBadge granted={selfGranted} denied={selfDenied} hasFix={hasGpsFix} />
            <Link href="/map" className="btn btn-outline btn-sm">
              Open full map →
            </Link>
          </div>
        </div>
        <div className="dashboard-featured-map-canvas">
          <MapView
            userLocation={userLocation}
            height="100%"
            selfLiveOverride={selfGranted}
            liveLocations={liveLocations}
          />
        </div>
      </section>

      <div className="container py-xl">
        {/* Stats */}
        <div className="dashboard-stats-grid">
          {stats.map((s, i) => (
            <div key={i} className="dashboard-stat-card">
              <div
                className="dashboard-stat-icon"
                style={{ background: `${s.color}1A`, color: s.color }}
              >
                {s.icon}
              </div>
              <div className="dashboard-stat-meta">
                <p className="dashboard-stat-value">{s.value}</p>
                <p className="dashboard-stat-label">{s.label}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="dashboard-grid">
          {/* Trips */}
          <section className="dashboard-card">
            <div className="dashboard-card-header">
              <div>
                <h2 className="dashboard-card-title">Your trips</h2>
                <p className="dashboard-card-sub">Itineraries you&apos;re planning with local buddies.</p>
              </div>
              <div className="dashboard-card-actions">
                <Link href="/tourist/trips/create" className="btn btn-primary btn-sm">
                  ＋ Plan a trip
                </Link>
                <Link href="/tourist/trips" className="dashboard-card-link">See all →</Link>
              </div>
            </div>
            <div className="dashboard-card-body">
              {trips.length === 0 ? (
                <div className="dashboard-empty">
                  <div className="dashboard-empty-icon">🧳</div>
                  <p>You don&apos;t have any trips yet.</p>
                  <div className="dashboard-empty-actions">
                    <Link href="/tourist/trips/create" className="btn btn-primary mt-md">
                      Plan your first trip
                    </Link>
                    <Link href="/tourist/browse" className="btn btn-outline mt-md">
                      Find a buddy to get started
                    </Link>
                  </div>
                </div>
              ) : (
                <ul className="dashboard-list">
                  {trips.slice(0, 5).map((trip) => {
                    const buddy = trip.buddy as any
                    return (
                      <li key={trip.id} className="dashboard-list-row">
                        <div className="dashboard-list-main">
                          <p className="font-medium">{trip.title}</p>
                          <p className="text-sm text-muted">
                            📍 {trip.destination}
                            {trip.start_date && ` · 📅 ${new Date(trip.start_date).toLocaleDateString('en-US')}`}
                          </p>
                          {buddy?.profile?.full_name && (
                            <p className="text-xs text-muted mt-xs">
                              👤 Buddy: {buddy.profile.full_name}
                            </p>
                          )}
                        </div>
                        <div className="dashboard-list-actions">
                          <span className={`badge badge-${
                            trip.status === 'completed' ? 'info'
                            : trip.status === 'confirmed' ? 'success'
                            : trip.status === 'cancelled' ? 'danger'
                            : 'primary'
                          }`}>
                            {trip.status === 'completed' ? '✓ Completed'
                             : trip.status === 'confirmed' ? '✓ Confirmed'
                             : trip.status === 'cancelled' ? '✕ Cancelled'
                             : '⏳ Planning'}
                          </span>
                          {trip.status === 'completed' && buddy?.id && (
                            <Link href={`/review/${trip.id}`} className="btn btn-sm btn-outline">
                              ⭐ Review
                            </Link>
                          )}
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          </section>

          <section className="dashboard-card">
            <div className="dashboard-card-header">
              <div>
                <h2 className="dashboard-card-title">My buddies</h2>
                <p className="dashboard-card-sub">Buddies you&apos;ve connected with.</p>
              </div>
              <Link href="/chat" className="dashboard-card-link">Open chat →</Link>
            </div>
            <div className="dashboard-card-body">
              {connections.length === 0 ? (
                <div className="dashboard-empty">
                  <div className="dashboard-empty-icon">👋</div>
                  <p>You haven&apos;t connected with any buddies yet.</p>
                  <Link href="/tourist/browse" className="btn btn-primary btn-sm mt-md">
                    Browse now
                  </Link>
                </div>
              ) : (
                <ul className="dashboard-list">
                  {connections.slice(0, 5).map((c) => {
                    const buddy = c.buddy as any
                    const name = buddy?.profile?.full_name ?? 'Buddy'
                    return (
                      <li key={c.id} className="dashboard-list-row">
                        <div className="dashboard-list-main flex items-center gap-sm">
                          <div className="avatar avatar-md">{name.charAt(0)}</div>
                          <div>
                            <p className="text-sm font-medium">{name}</p>
                            <p className="text-xs text-muted">{buddy?.location_city ?? 'Da Nang'}</p>
                          </div>
                        </div>
                        <div className="dashboard-list-actions">
                          <span className={`badge badge-${c.status === 'accepted' ? 'success' : c.status === 'declined' ? 'danger' : 'primary'}`}>
                            {c.status === 'accepted' ? '✓ Connected' : c.status === 'pending' ? '⏳ Pending' : '✕ Declined'}
                          </span>
                          {c.status === 'accepted' && (
                            <Link href={`/chat?buddy=${buddy?.id}`} className="btn btn-sm btn-ghost">💬</Link>
                          )}
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          </section>

          {/* Quick actions */}
          <section className="dashboard-card">
            <div className="dashboard-card-header">
              <h2 className="dashboard-card-title">Quick actions</h2>
            </div>
            <div className="dashboard-card-body dashboard-actions">
              <Link href="/tourist/browse" className="dashboard-action">
                <span className="dashboard-action-icon">🔍</span>
                <span className="dashboard-action-text">
                  <strong>Find buddies</strong>
                  <small>Browse verified local guides</small>
                </span>
              </Link>
              <Link href="/map" className="dashboard-action">
                <span className="dashboard-action-icon">🗺️</span>
                <span className="dashboard-action-text">
                  <strong>Buddy map</strong>
                  <small>See who&apos;s nearby right now</small>
                </span>
              </Link>
              <Link href="/chat" className="dashboard-action">
                <span className="dashboard-action-icon">💬</span>
                <span className="dashboard-action-text">
                  <strong>Messages</strong>
                  <small>Chat with your buddies</small>
                </span>
              </Link>
              <Link href="/tourist/profile" className="dashboard-action">
                <span className="dashboard-action-icon">👤</span>
                <span className="dashboard-action-text">
                  <strong>My profile</strong>
                  <small>Update preferences & interests</small>
                </span>
              </Link>
            </div>
          </section>
        </div>
      </div>

      <style>{`
        .dashboard-featured-map {
          background: #fff;
          border-top: 1px solid var(--border-color, #e5e7eb);
          border-bottom: 1px solid var(--border-color, #e5e7eb);
        }
        .dashboard-featured-map-header {
          max-width: 1200px;
          margin: 0 auto;
          padding: var(--space-lg) var(--space-md) var(--space-md);
          display: flex;
          align-items: flex-end;
          justify-content: space-between;
          gap: var(--space-md);
          flex-wrap: wrap;
        }
        .dashboard-featured-map-title {
          font-size: var(--font-size-xl, 22px);
          font-weight: 700;
          margin: 0;
        }
        .dashboard-featured-map-sub {
          margin: 4px 0 0;
          color: var(--text-muted, #6b7280);
          font-size: 14px;
        }
        .dashboard-featured-map-actions {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
        }
        .dashboard-featured-map-canvas {
          height: clamp(360px, 52vh, 560px);
          width: 100%;
          background: linear-gradient(135deg, #e0f7fa 0%, #b2ebf2 100%);
        }
        .dashboard-grid {
          display: grid;
          grid-template-columns: 2fr 1fr;
          gap: var(--space-lg);
        }
        @media (max-width: 900px) {
          .dashboard-grid { grid-template-columns: 1fr; }
          .dashboard-featured-map-header { padding: var(--space-md); }
        }
      `}</style>
    </div>
  )
}

function ShareStatusBadge({ granted, denied, hasFix }: { granted: boolean; denied: boolean; hasFix: boolean }) {
  if (granted && hasFix) {
    return (
      <span className="badge badge-success" title="You're sharing your live location with other travellers on the map.">
        <span style={{
          display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
          background: '#28A745', marginRight: 6,
          boxShadow: '0 0 0 0 rgba(40,167,69,0.6)',
          animation: 'liveBadgePulse 2s ease-out infinite',
        }} />
        Sharing live
      </span>
    )
  }
  if (denied) {
    return (
      <span className="badge badge-warning" title="Location permission was denied. Enable it in your browser to show up on the map.">
        ⚠️ Location off
      </span>
    )
  }
  return (
    <span className="badge badge-primary" title="Asking for location permission…">
      ⏳ Locating…
    </span>
  )
}
