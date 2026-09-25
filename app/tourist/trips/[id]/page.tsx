'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/utils/supabase/auth'
import type { Trip, TripStop } from '@/lib/types'

export default function TripDetailPage() {
  const params = useParams()
  const tripId = params?.id as string
  const [trip, setTrip] = useState<Trip | null>(null)
  const [stops, setStops] = useState<TripStop[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const [{ data: t }, { data: s }] = await Promise.all([
        supabase.from('trips').select('*, buddy:buddies(*, profile:profiles(*))').eq('id', tripId).single<Trip>(),
        supabase.from('trip_stops').select('*').eq('trip_id', tripId).order('stop_order', { ascending: true }),
      ])
      setTrip(t)
      setStops((s as TripStop[]) || [])
      setLoading(false)
    }
    if (tripId) load()
  }, [tripId])

  if (loading) return <div className="container py-xl text-center"><div className="loading-spinner mx-auto" /></div>
  if (!trip) return <div className="container py-xl"><p>Không tìm thấy chuyến đi</p></div>

  const buddy = trip.buddy as any

  return (
    <div className="container py-xl">
      <Link href="/tourist/trips" className="text-primary text-sm">← Danh sách chuyến đi</Link>

      <div className="flex-between mt-md mb-lg">
        <div>
          <span className={`badge badge-${trip.status === 'confirmed' ? 'success' : 'primary'}`}>{trip.status}</span>
          <h1 className="text-3xl font-bold mt-sm">{trip.title}</h1>
          <p className="text-muted mt-xs">
            📍 {trip.destination} • 📅 {trip.start_date && new Date(trip.start_date).toLocaleDateString('vi-VN')} - {trip.end_date && new Date(trip.end_date).toLocaleDateString('vi-VN')}
          </p>
        </div>
        {buddy && (
          <Link href={`/tourist/buddy/${buddy.id}`} className="card" style={{ minWidth: 200, textDecoration: 'none' }}>
            <div className="card-body flex items-center gap-sm">
              <div className="avatar avatar-md">{buddy.profile.full_name.charAt(0)}</div>
              <div>
                <p className="text-sm text-muted">Buddy của bạn</p>
                <p className="font-semibold">{buddy.profile.full_name}</p>
              </div>
            </div>
          </Link>
        )}
      </div>

      {trip.notes && (
        <div className="card mb-lg">
          <div className="card-body">
            <h4 className="font-semibold mb-sm">Ghi chú</h4>
            <p className="text-secondary">{trip.notes}</p>
          </div>
        </div>
      )}

      <h2 className="text-xl font-bold mb-md">🗺️ Lộ trình ({stops.length} điểm)</h2>

      {stops.length === 0 ? (
        <div className="empty-state">
          <p>Chuyến đi chưa có điểm dừng nào.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-md">
          {stops.map((stop, idx) => (
            <div key={stop.id} className="card">
              <div className="card-body flex items-start gap-md">
                <div
                  style={{
                    width: 40, height: 40, borderRadius: '50%',
                    background: 'var(--primary)', color: 'white',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontWeight: 700, flexShrink: 0,
                  }}
                >
                  {idx + 1}
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold">{stop.name}</h3>
                  {stop.address && <p className="text-sm text-muted mt-xs">📍 {stop.address}</p>}
                  {stop.notes && <p className="text-sm text-secondary mt-sm">{stop.notes}</p>}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
