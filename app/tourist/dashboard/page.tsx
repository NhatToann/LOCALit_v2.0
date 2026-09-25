'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { createClient } from '@/utils/supabase/auth'
import type { Profile, Trip, Connection } from '@/lib/types'

const MapView = dynamic(() => import('@/components/map/MapView'), { ssr: false })

const DEFAULT_LOCATION = { lat: 16.0544, lng: 108.2023 }

export default function TouristDashboardPage() {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [trips, setTrips] = useState<Trip[]>([])
  const [connections, setConnections] = useState<Connection[]>([])
  const [buddies, setBuddies] = useState<any[]>([])
  const [reviewsCount, setReviewsCount] = useState(0)
  const [userLocation, setUserLocation] = useState(DEFAULT_LOCATION)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    load()

    if (typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => {},
        { enableHighAccuracy: false, timeout: 4000 },
      )
    }
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
    { label: 'Pending', value: pending.length, icon: '⏳', color: '#FFC107' },
    { label: 'Reviews sent', value: reviewsCount, icon: '⭐', color: '#FFB347' },
  ]

  return (
    <div className="container py-xl">
      <div className="flex-between mb-xl" style={{ flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 className="text-3xl">Welcome back, {profile?.full_name?.split(' ')[0] || 'traveler'}! 👋</h1>
          <p className="text-muted">Ready for your next Da Nang adventure?</p>
        </div>
        <div className="flex gap-sm">
          <Link href="/tourist/browse" className="btn btn-primary">
            🔍 Find buddies
          </Link>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-4 mb-xl">
        {stats.map((s, i) => (
          <div key={i} className="card">
            <div className="card-body flex items-center gap-md">
              <div
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: 16,
                  background: `${s.color}20`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 28,
                }}
              >
                {s.icon}
              </div>
              <div>
                <p className="text-2xl font-bold">{s.value}</p>
                <p className="text-sm text-muted">{s.label}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="dashboard-grid">
        {/* Trips */}
        <section className="card">
          <div className="card-header flex-between">
            <h2 className="text-xl font-semibold">Your trips</h2>
            <Link href="/tourist/browse" className="text-primary text-sm">Find more buddies →</Link>
          </div>
          <div className="card-body">
            {trips.length === 0 ? (
              <div className="empty-state">
                <p>📭 You don&apos;t have any trips yet.</p>
                <Link href="/tourist/browse" className="btn btn-primary mt-md">
                  Find a buddy to get started
                </Link>
              </div>
            ) : (
              <ul className="flex flex-col">
                {trips.slice(0, 5).map((trip) => {
                  const buddy = trip.buddy as any
                  return (
                    <li key={trip.id} className="trip-row" style={{ padding: 'var(--space-md) 0', borderBottom: '1px solid var(--border-color)' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
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
                      <div className="flex items-center gap-sm">
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

        <section className="card">
          <div className="card-header">
            <h2 className="text-xl font-semibold">My buddies</h2>
          </div>
          <div className="card-body">
            {connections.length === 0 ? (
              <div className="empty-state">
                <p>You haven&apos;t connected with any buddies yet.</p>
                <Link href="/tourist/browse" className="btn btn-primary btn-sm mt-md">
                  Browse now
                </Link>
              </div>
            ) : (
              <ul className="flex flex-col">
                {connections.slice(0, 5).map((c) => {
                  const buddy = c.buddy as any
                  const name = buddy?.profile?.full_name ?? 'Buddy'
                  return (
                    <li key={c.id} className="flex items-center gap-sm" style={{ padding: 'var(--space-sm) 0', borderBottom: '1px solid var(--border-color)' }}>
                      <div className="avatar avatar-md">{name.charAt(0)}</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p className="text-sm font-medium">{name}</p>
                        <p className="text-xs text-muted">{buddy?.location_city ?? 'Da Nang'}</p>
                      </div>
                      <div className="flex flex-col items-end gap-xs">
                        <span className={`badge badge-${c.status === 'accepted' ? 'success' : c.status === 'declined' ? 'danger' : 'primary'}`}>
                          {c.status === 'accepted' ? '✓' : c.status === 'pending' ? '⏳' : '✕'}
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

        {/* Mini map */}
        <section className="card dashboard-map-card">
          <div className="card-header flex-between">
            <h2 className="text-xl font-semibold">Buddies nearby</h2>
            <Link href="/map" className="text-primary text-sm">Open full map →</Link>
          </div>
          <div style={{ height: 300 }}>
            <MapView userLocation={userLocation} height={300} />
          </div>
        </section>

        {/* Quick actions */}
        <section className="card">
          <div className="card-header">
            <h2 className="text-xl font-semibold">Quick actions</h2>
          </div>
          <div className="card-body flex flex-col gap-md">
            <Link href="/tourist/browse" className="btn btn-outline btn-block">🔍 Find buddies</Link>
            <Link href="/map" className="btn btn-outline btn-block">🗺️ Buddy map</Link>
            <Link href="/chat" className="btn btn-outline btn-block">💬 Messages</Link>
            <Link href="/tourist/profile" className="btn btn-outline btn-block">👤 My profile</Link>
          </div>
        </section>
      </div>

      <style>{`
        .dashboard-grid {
          display: grid;
          grid-template-columns: 2fr 1fr;
          gap: var(--space-lg);
        }
        .dashboard-map-card { grid-column: 1 / -1; padding: 0; overflow: hidden; }
        .dashboard-map-card .card-header { padding: var(--space-md) var(--space-lg); margin: 0; }
        @media (max-width: 900px) {
          .dashboard-grid { grid-template-columns: 1fr; }
        }
      `}</style>
    </div>
  )
}
