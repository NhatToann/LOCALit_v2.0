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
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const [{ data: p }, { data: t }, { data: c }, { data: buddyPins }, { count: rCount }] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', user.id).single<Profile>(),
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
        .not('latitude', 'is', null)
        .not('longitude', 'is', null)
        .limit(20),
      supabase
        .from('reviews')
        .select('id', { count: 'exact', head: true })
        .eq('reviewer_id', user.id),
    ])

    setProfile(p)
    setTrips((t || []) as Trip[])
    setConnections((c || []) as Connection[])
    setBuddies(buddyPins ?? [])
    setReviewsCount(rCount ?? 0)
    setLoading(false)
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
    { label: 'Chuyến đi', value: trips.length, icon: '🧳', color: '#FF6B35' },
    { label: 'Buddy đã kết nối', value: accepted.length, icon: '👥', color: '#28A745' },
    { label: 'Đang chờ', value: pending.length, icon: '⏳', color: '#FFC107' },
    { label: 'Đánh giá đã gửi', value: reviewsCount, icon: '⭐', color: '#FFB347' },
  ]

  return (
    <div className="container py-xl">
      <div className="flex-between mb-xl" style={{ flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 className="text-3xl">Xin chào, {profile?.full_name?.split(' ')[0] || 'bạn'}! 👋</h1>
          <p className="text-muted">Sẵn sàng cho cuộc phiêu lưu tiếp theo?</p>
        </div>
        <div className="flex gap-sm">
          <Link href="/tourist/browse" className="btn btn-primary">
            🔍 Tìm buddy
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
            <h2 className="text-xl font-semibold">Chuyến đi của bạn</h2>
            <Link href="/tourist/browse" className="text-primary text-sm">Tìm thêm buddy →</Link>
          </div>
          <div className="card-body">
            {trips.length === 0 ? (
              <div className="empty-state">
                <p>📭 Bạn chưa có chuyến đi nào.</p>
                <Link href="/tourist/browse" className="btn btn-primary mt-md">
                  Tìm buddy để bắt đầu
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
                          {trip.start_date && ` · 📅 ${new Date(trip.start_date).toLocaleDateString('vi-VN')}`}
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
                          {trip.status === 'completed' ? '✓ Hoàn thành'
                           : trip.status === 'confirmed' ? '✓ Đã xác nhận'
                           : trip.status === 'cancelled' ? '✕ Đã hủy'
                           : '⏳ Lên kế hoạch'}
                        </span>
                        {trip.status === 'completed' && buddy?.id && (
                          <Link href={`/review/${trip.id}`} className="btn btn-sm btn-outline">
                            ⭐ Đánh giá
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
            <h2 className="text-xl font-semibold">Buddy của tôi</h2>
          </div>
          <div className="card-body">
            {connections.length === 0 ? (
              <div className="empty-state">
                <p>Bạn chưa kết nối với buddy nào.</p>
                <Link href="/tourist/browse" className="btn btn-primary btn-sm mt-md">
                  Khám phá ngay
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
                        <p className="text-xs text-muted">{buddy?.location_city ?? '—'}</p>
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
            <h2 className="text-xl font-semibold">Buddy xung quanh</h2>
            <Link href="/map" className="text-primary text-sm">Mở bản đồ lớn →</Link>
          </div>
          <div style={{ height: 300 }}>
            <MapView userLocation={userLocation} height={300} />
          </div>
        </section>

        {/* Quick actions */}
        <section className="card">
          <div className="card-header">
            <h2 className="text-xl font-semibold">Thao tác nhanh</h2>
          </div>
          <div className="card-body flex flex-col gap-md">
            <Link href="/tourist/browse" className="btn btn-outline btn-block">🔍 Tìm Buddy</Link>
            <Link href="/map" className="btn btn-outline btn-block">🗺️ Bản đồ Buddy</Link>
            <Link href="/chat" className="btn btn-outline btn-block">💬 Tin nhắn</Link>
            <Link href="/tourist/profile" className="btn btn-outline btn-block">👤 Hồ sơ của tôi</Link>
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
