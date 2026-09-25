'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/utils/supabase/auth'
import type { Trip } from '@/lib/types'

export default function TripsPage() {
  const [trips, setTrips] = useState<Trip[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data } = await supabase
        .from('trips')
        .select('*, buddy:buddies(*, profile:profiles(*))')
        .eq('tourist_id', user.id)
        .order('start_date', { ascending: true })

      setTrips((data as Trip[]) || [])
      setLoading(false)
    }
    load()
  }, [])

  if (loading) return <div className="container py-xl text-center"><div className="loading-spinner mx-auto" /></div>

  return (
    <div className="container py-xl">
      <div className="flex-between mb-lg">
        <h1 className="text-3xl font-bold">My Trips</h1>
        <Link href="/tourist/trips/create" className="btn btn-primary">➕ Plan a trip</Link>
      </div>

      {trips.length === 0 ? (
        <div className="empty-state">
          <p>You don&apos;t have any trips yet.</p>
          <Link href="/tourist/trips/create" className="btn btn-primary mt-md">Plan your first trip</Link>
        </div>
      ) : (
        <div className="grid grid-auto">
          {trips.map(trip => {
            const buddy = trip.buddy as any
            return (
              <Link key={trip.id} href={`/tourist/trips/${trip.id}`} className="card" style={{ textDecoration: 'none' }}>
                <div style={{ height: 80, background: 'linear-gradient(135deg, var(--info), #4dd0e1)' }} />
                <div className="card-body">
                  <div className="flex-between">
                    <span className={`badge badge-${trip.status === 'confirmed' ? 'success' : trip.status === 'completed' ? 'info' : 'primary'}`}>
                      {trip.status}
                    </span>
                    <span className="text-sm text-muted">
                      {trip.start_date ? new Date(trip.start_date).toLocaleDateString('en-US') : ''}
                    </span>
                  </div>
                  <h3 className="mt-md font-semibold">{trip.title}</h3>
                  <p className="text-sm text-muted mt-xs">📍 {trip.destination || 'Da Nang'}</p>
                  {buddy && (
                    <p className="text-sm text-secondary mt-sm">
                      👤 Buddy: {buddy.profile.full_name}
                    </p>
                  )}
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
