'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { createClient } from '@/utils/supabase/auth'
import type { Profile, Connection, Trip } from '@/lib/types'
import '../../dashboard.css'

const MapView = dynamic(() => import('@/components/map/MapView'), { ssr: false })

const DEFAULT_LOCATION = { lat: 16.0544, lng: 108.2023 }

export default function BuddyDashboardPage() {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [buddyProfile, setBuddyProfile] = useState<any | null>(null)
  const [requests, setRequests] = useState<Connection[]>([])
  const [trips, setTrips] = useState<Trip[]>([])
  const [reviewsCount, setReviewsCount] = useState(0)
  const [avgRating, setAvgRating] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [toggling, setToggling] = useState(false)
  const [userLocation, setUserLocation] = useState(DEFAULT_LOCATION)
  const [shareLocation, setShareLocation] = useState(false)

  useEffect(() => {
    async function load() {
      try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
          setLoading(false)
          return
        }

        const [
          { data: p },
          { data: c },
          { data: t },
          { data: b },
          { data: myReviews },
        ] = await Promise.all([
          supabase.from('profiles').select('*').eq('id', user.id).maybeSingle<Profile>(),
          supabase
            .from('connections')
            .select('*, tourist:tourists(*, profile:profiles(*))')
            .eq('buddy_id', user.id)
            .order('created_at', { ascending: false }),
          supabase
            .from('trips')
            .select('*, tourist:tourists(*, profile:profiles(*))')
            .eq('buddy_id', user.id),
          supabase
            .from('buddies')
            .select('*')
            .eq('id', user.id)
            .maybeSingle(),
          supabase
            .from('reviews')
            .select('rating')
            .eq('reviewee_id', user.id),
        ])

        setProfile(p ?? null)
        setBuddyProfile(b ?? null)
        setRequests((c || []) as Connection[])
        setTrips((t || []) as Trip[])
        setReviewsCount((myReviews || []).length)
        if (myReviews && myReviews.length > 0) {
          const sum = myReviews.reduce((acc, r) => acc + (r.rating || 0), 0)
          setAvgRating(Math.round((sum / myReviews.length) * 10) / 10)
        } else {
          setAvgRating(null)
        }
      } catch (err) {
        console.error('Buddy dashboard load failed:', err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  useEffect(() => {
    if (typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => {},
        { enableHighAccuracy: false, timeout: 4000 },
      )
    }
  }, [])

  async function toggleAvailability() {
    if (!profile) return
    setToggling(true)
    const supabase = createClient()
    const newStatus = !profile.is_online
    await supabase.from('profiles').update({ is_online: newStatus, last_seen: new Date().toISOString() }).eq('id', profile.id)
    setProfile({ ...profile, is_online: newStatus })
    setToggling(false)
  }

  if (loading) {
    return <div className="container py-xl text-center"><div className="loading-spinner mx-auto" /></div>
  }

  const pendingCount = requests.filter(r => r.status === 'pending').length
  const acceptedCount = requests.filter(r => r.status === 'accepted').length
  const upcomingTrips = trips.filter(t => t.status === 'confirmed' || t.status === 'planning').length

  const stats = [
    { label: 'Pending requests', value: pendingCount, icon: '⏳', color: '#FFC107' },
    { label: 'Active connections', value: acceptedCount, icon: '✓', color: '#28A745' },
    { label: 'Upcoming trips', value: upcomingTrips, icon: '🧳', color: '#FF6B35' },
    {
      label: 'Avg rating',
      value: avgRating !== null ? `${avgRating.toFixed(1)}★` : '—',
      icon: '⭐',
      color: '#FFB347',
    },
  ]

  const firstName = profile?.full_name?.split(' ')[0] || 'buddy'
  const city = buddyProfile?.location_city || 'Da Nang'

  return (
    <div className="dashboard-root">
      {/* Hero */}
      <section className="dashboard-hero dashboard-hero-buddy">
        <div className="dashboard-hero-bg" aria-hidden="true">
          <span className="dashboard-hero-blob blob-1" />
          <span className="dashboard-hero-blob blob-2" />
        </div>
        <div className="dashboard-hero-content">
          <div>
            <span className="dashboard-hero-eyebrow">🌍 Local buddy dashboard</span>
            <h1 className="dashboard-hero-title">
              Hi <span className="dashboard-hero-name">{firstName}</span>! 👋
            </h1>
            <p className="dashboard-hero-sub">
              {pendingCount > 0
                ? <>You have <strong>{pendingCount}</strong> pending {pendingCount === 1 ? 'request' : 'requests'} waiting for your reply.</>
                : <>You&apos;re all caught up. Time to plan something fun in <strong>{city}</strong>!</>}
            </p>
          </div>
          <div className="dashboard-hero-cta">
            <button
              onClick={toggleAvailability}
              disabled={toggling}
              className={`btn btn-lg ${profile?.is_online ? 'btn-primary' : 'btn-outline btn-on-dark'}`}
            >
              {profile?.is_online ? '🟢 Accepting requests' : '⚪ Currently offline'}
            </button>
            <Link href="/buddy/profile" className="btn btn-outline btn-lg btn-on-dark">
              ✏️ Edit profile
            </Link>
          </div>
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
          {/* Pending requests */}
          <section className="dashboard-card">
            <div className="dashboard-card-header">
              <div>
                <h2 className="dashboard-card-title">Connection requests</h2>
                <p className="dashboard-card-sub">Tourists who want to explore with you.</p>
              </div>
              <Link href="/buddy/requests" className="dashboard-card-link">Manage all →</Link>
            </div>
            <div className="dashboard-card-body">
              {requests.filter(r => r.status === 'pending').length === 0 ? (
                <div className="dashboard-empty">
                  <div className="dashboard-empty-icon">📭</div>
                  <p>No pending requests right now.</p>
                  <p className="dashboard-empty-sub">When travelers reach out, they&apos;ll show up here.</p>
                </div>
              ) : (
                <ul className="dashboard-list">
                  {requests.filter(r => r.status === 'pending').slice(0, 5).map(r => {
                    const t = r.tourist as any
                    const name = t?.profile?.full_name || 'Traveler'
                    return (
                      <li key={r.id} className="dashboard-list-row">
                        <div className="dashboard-list-main flex items-center gap-sm">
                          <div className="avatar avatar-md">{name.charAt(0)}</div>
                          <div>
                            <p className="font-medium">{name}</p>
                            <p className="text-xs text-muted">
                              {t?.nationality || '—'} · {t?.destination || 'Da Nang'}
                            </p>
                            {r.message && (
                              <p className="dashboard-message">&ldquo;{r.message}&rdquo;</p>
                            )}
                          </div>
                        </div>
                        <div className="dashboard-list-actions">
                          <Link href="/buddy/requests" className="btn btn-primary btn-sm">Review</Link>
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
              <Link href="/buddy/requests" className="dashboard-action">
                <span className="dashboard-action-icon">📨</span>
                <span className="dashboard-action-text">
                  <strong>Review requests</strong>
                  <small>{pendingCount} pending</small>
                </span>
              </Link>
              <Link href="/buddy/profile" className="dashboard-action">
                <span className="dashboard-action-icon">✏️</span>
                <span className="dashboard-action-text">
                  <strong>Update profile</strong>
                  <small>Bio, specialties, hourly rate</small>
                </span>
              </Link>
              <Link href="/chat" className="dashboard-action">
                <span className="dashboard-action-icon">💬</span>
                <span className="dashboard-action-text">
                  <strong>Messages</strong>
                  <small>Chat with active tourists</small>
                </span>
              </Link>
              <Link href="/map" className="dashboard-action">
                <span className="dashboard-action-icon">📍</span>
                <span className="dashboard-action-text">
                  <strong>Pin my location</strong>
                  <small>Show up on the buddy map</small>
                </span>
              </Link>
            </div>
          </section>

          {/* Upcoming trips */}
          <section className="dashboard-card">
            <div className="dashboard-card-header">
              <div>
                <h2 className="dashboard-card-title">Upcoming trips</h2>
                <p className="dashboard-card-sub">Trips you&apos;re guiding.</p>
              </div>
            </div>
            <div className="dashboard-card-body">
              {trips.length === 0 ? (
                <div className="dashboard-empty">
                  <div className="dashboard-empty-icon">🧭</div>
                  <p>No trips booked yet.</p>
                  <p className="dashboard-empty-sub">Accept a request to start planning.</p>
                </div>
              ) : (
                <ul className="dashboard-list">
                  {trips.slice(0, 5).map((trip) => {
                    const t = trip.tourist as any
                    const name = t?.profile?.full_name || 'Traveler'
                    return (
                      <li key={trip.id} className="dashboard-list-row">
                        <div className="dashboard-list-main">
                          <p className="font-medium">{trip.title}</p>
                          <p className="text-sm text-muted">
                            📍 {trip.destination}
                            {trip.start_date && ` · 📅 ${new Date(trip.start_date).toLocaleDateString('en-US')}`}
                          </p>
                          <p className="text-xs text-muted mt-xs">👤 {name}</p>
                        </div>
                        <div className="dashboard-list-actions">
                          <span className={`badge badge-${
                            trip.status === 'completed' ? 'info'
                            : trip.status === 'confirmed' ? 'success'
                            : trip.status === 'cancelled' ? 'danger'
                            : 'primary'
                          }`}>
                            {trip.status === 'completed' ? '✓ Done'
                             : trip.status === 'confirmed' ? '✓ Confirmed'
                             : trip.status === 'cancelled' ? '✕ Cancelled'
                             : '⏳ Planning'}
                          </span>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          </section>

          {/* Map */}
          <section className="dashboard-card dashboard-map-card">
            <div className="dashboard-card-header">
              <div>
                <h2 className="dashboard-card-title">Your location</h2>
                <p className="dashboard-card-sub">Pin where you guide so tourists can find you.</p>
              </div>
              <div className="flex gap-sm">
                <button
                  type="button"
                  className={`btn btn-sm ${shareLocation ? 'btn-primary' : 'btn-outline'}`}
                  onClick={() => setShareLocation(v => !v)}
                  title="Use your live location"
                >
                  {shareLocation ? '📍 Sharing live' : '📍 Share my location'}
                </button>
                <Link href="/buddy/profile" className="dashboard-card-link">Edit pin →</Link>
              </div>
            </div>
            <div style={{ height: 280 }}>
              <MapView
                userLocation={userLocation}
                height={280}
              />
            </div>
          </section>
        </div>
      </div>

      <style>{`
        .dashboard-grid {
          display: grid;
          grid-template-columns: 2fr 1fr;
          gap: var(--space-lg);
        }
        .dashboard-map-card { grid-column: 1 / -1; padding: 0; overflow: hidden; }
        .dashboard-map-card > .dashboard-card-header { padding: var(--space-md) var(--space-lg); margin: 0; border-bottom: 1px solid var(--border-color); }
        @media (max-width: 900px) {
          .dashboard-grid { grid-template-columns: 1fr; }
        }
      `}</style>
    </div>
  )
}