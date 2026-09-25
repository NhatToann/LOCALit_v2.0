'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/utils/supabase/auth'
import type { Profile, Trip, Connection } from '@/lib/types'

export default function TouristDashboardPage() {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [trips, setTrips] = useState<Trip[]>([])
  const [connections, setConnections] = useState<Connection[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const [{ data: p }, { data: t }, { data: c }] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', user.id).single<Profile>(),
        supabase.from('trips').select('*, buddy:buddies(*, profile:profiles(*))').eq('tourist_id', user.id).order('created_at', { ascending: false }),
        supabase.from('connections').select('*, buddy:buddies(*, profile:profiles(*))').eq('tourist_id', user.id).order('created_at', { ascending: false }),
      ])

      setProfile(p)
      setTrips((t || []) as Trip[])
      setConnections((c || []) as Connection[])
      setLoading(false)
    }
    load()
  }, [])

  if (loading) {
    return (
      <div className="container py-xl text-center">
        <div className="loading-spinner mx-auto" />
      </div>
    )
  }

  const stats = [
    { label: 'Chuyến đi', value: trips.length, icon: '🧳', color: '#FF6B35' },
    { label: 'Buddy đã kết nối', value: connections.filter(c => c.status === 'accepted').length, icon: '👥', color: '#28A745' },
    { label: 'Đang chờ', value: connections.filter(c => c.status === 'pending').length, icon: '⏳', color: '#FFC107' },
    { label: 'Đánh giá', value: 0, icon: '⭐', color: '#FFB347' },
  ]

  return (
    <div className="container py-xl">
      <div className="flex-between mb-xl">
        <div>
          <h1 className="text-3xl">Xin chào, {profile?.full_name?.split(' ')[0] || 'bạn'}! 👋</h1>
          <p className="text-muted">Sẵn sàng cho cuộc phiêu lưu tiếp theo?</p>
        </div>
        <div className="flex gap-sm">
          <Link href="/tourist/trips/create" className="btn btn-primary">
            ➕ Tạo chuyến đi
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

      <div className="grid" style={{ gridTemplateColumns: '2fr 1fr', gap: 'var(--space-lg)' }}>
        {/* Trips */}
        <div className="card">
          <div className="card-header flex-between">
            <h2 className="text-xl font-semibold">Chuyến đi gần đây</h2>
            <Link href="/tourist/trips" className="text-primary text-sm">Xem tất cả →</Link>
          </div>
          <div className="card-body">
            {trips.length === 0 ? (
              <div className="empty-state">
                <p>📭 Bạn chưa có chuyến đi nào.</p>
                <Link href="/tourist/trips/create" className="btn btn-primary mt-md">
                  Tạo chuyến đi đầu tiên
                </Link>
              </div>
            ) : (
              <ul className="flex flex-col">
                {trips.slice(0, 5).map(trip => {
                  const buddy = trip.buddy as any
                  const buddyName = buddy?.profile?.full_name
                  return (
                    <li key={trip.id} className="flex-between py-md" style={{ borderBottom: '1px solid var(--border-color)' }}>
                      <div>
                        <p className="font-medium">{trip.title}</p>
                        <p className="text-sm text-muted">
                          📍 {trip.destination} • 📅 {new Date(trip.start_date!).toLocaleDateString('vi-VN')}
                        </p>
                        {buddyName && (
                          <p className="text-xs text-muted mt-xs">Với buddy {buddyName}</p>
                        )}
                      </div>
                      <span className={`badge badge-${trip.status === 'confirmed' ? 'success' : trip.status === 'completed' ? 'info' : 'primary'}`}>
                        {trip.status}
                      </span>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </div>

        {/* Connections */}
        <div className="card">
          <div className="card-header">
            <h2 className="text-xl font-semibold">Buddy của tôi</h2>
          </div>
          <div className="card-body">
            {connections.length === 0 ? (
              <div className="empty-state">
                <p>Tìm buddy ngay!</p>
                <Link href="/tourist/browse" className="btn btn-primary btn-sm mt-md">
                  Khám phá
                </Link>
              </div>
            ) : (
              <ul className="flex flex-col">
                {connections.slice(0, 5).map(c => {
                  const buddy = c.buddy as any
                  return (
                    <li key={c.id} className="flex items-center gap-sm py-sm" style={{ borderBottom: '1px solid var(--border-color)' }}>
                      <div className="avatar avatar-md">
                        {buddy?.profile?.full_name?.charAt(0) || '?'}
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-medium">{buddy?.profile?.full_name}</p>
                        <p className="text-xs text-muted">{buddy?.location_city}</p>
                      </div>
                      <span className={`badge badge-${c.status === 'accepted' ? 'success' : 'primary'}`}>
                        {c.status === 'pending' ? 'Chờ' : '✓'}
                      </span>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
