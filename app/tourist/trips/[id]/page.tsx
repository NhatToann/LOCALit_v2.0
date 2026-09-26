'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, MapPin, Calendar, Star } from 'lucide-react'
import { createClient } from '@/utils/supabase/auth'
import type { Trip, TripStop } from '@/lib/types'
import { Avatar } from '@/components/ui/Avatar'

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
        supabase
          .from('trips')
          .select('*, buddy:buddies(*, profile:profiles(*))')
          .eq('id', tripId)
          .single<Trip>(),
        supabase
          .from('trip_stops')
          .select('*')
          .eq('trip_id', tripId)
          .order('stop_order', { ascending: true }),
      ])
      setTrip(t)
      setStops((s as TripStop[]) || [])
      setLoading(false)
    }
    if (tripId) load()
  }, [tripId])

  if (loading) {
    return (
      <div className="container-page py-16 text-center">
        <div className="loading-spinner mx-auto" />
      </div>
    )
  }
  if (!trip) {
    return (
      <div className="container-page py-16">
        <p className="text-muted">Trip not found.</p>
        <Link
          href="/tourist/trips"
          className="inline-flex items-center gap-1 mt-3 text-sm text-primary hover:underline"
        >
          <ArrowLeft size={14} aria-hidden="true" />
          Back to trips
        </Link>
      </div>
    )
  }

  const buddy = trip.buddy as any
  const statusBadge =
    trip.status === 'confirmed'
      ? 'badge-success'
      : trip.status === 'completed'
      ? 'badge-info'
      : trip.status === 'cancelled'
      ? 'badge-danger'
      : 'badge-warning'

  return (
    <div className="container-page py-8">
      <Link
        href="/tourist/trips"
        className="inline-flex items-center gap-1 text-sm text-primary hover:underline mb-4"
      >
        <ArrowLeft size={14} aria-hidden="true" />
        All trips
      </Link>

      <header className="mb-6 flex flex-wrap items-start justify-between gap-4 pb-6 border-b border-border">
        <div>
          <span className={`badge ${statusBadge} text-xs`}>{trip.status}</span>
          <h1 className="text-page-title mt-2">{trip.title}</h1>
          <p className="text-sm text-muted mt-2">
            <MapPin size={14} className="inline-block mr-1 align-middle" aria-hidden="true" />
            {trip.destination || 'Da Nang'}
            <span className="mx-2 text-border-strong">·</span>
            <Calendar size={14} className="inline-block mr-1 align-middle" aria-hidden="true" />
            {trip.start_date ? new Date(trip.start_date).toLocaleDateString('en-US') : '—'}
            {' – '}
            {trip.end_date ? new Date(trip.end_date).toLocaleDateString('en-US') : '—'}
          </p>
        </div>
        {buddy ? (
          <Link
            href={`/tourist/buddy/${buddy.id}`}
            className="inline-flex items-center gap-3 px-4 h-14 rounded-sm border border-border bg-surface hover:border-border-strong transition-colors duration-150"
          >
            <Avatar name={buddy.profile?.full_name ?? 'Buddy'} size="md" />
            <div>
              <p className="text-xs text-muted">Your buddy</p>
              <p className="text-sm font-semibold text-ink">
                {buddy.profile?.full_name ?? 'Assigned'}
              </p>
            </div>
          </Link>
        ) : (
          <span className="badge badge-warning">No buddy assigned yet</span>
        )}
      </header>

      {trip.notes ? (
        <section className="mb-8 border-l-2 border-border-strong pl-4">
          <p className="text-eyebrow text-muted mb-1">Notes</p>
          <p className="text-base text-ink leading-relaxed max-w-prose">{trip.notes}</p>
        </section>
      ) : null}

      <section className="mb-8">
        <header className="mb-4 flex items-baseline justify-between">
          <h2 className="text-section-title">Itinerary</h2>
          <span className="text-sm text-muted">
            {stops.length} {stops.length === 1 ? 'stop' : 'stops'}
          </span>
        </header>

        {stops.length === 0 ? (
          <div className="border border-border rounded-sm p-8 bg-surface text-center">
            <p className="text-sm text-muted">No stops planned yet.</p>
          </div>
        ) : (
          <ol className="border border-border rounded-sm bg-surface divide-y divide-border">
            {stops.map((stop, idx) => (
              <li key={stop.id} className="p-4 flex items-start gap-4">
                <div className="w-8 h-8 rounded-full bg-primary text-paper flex items-center justify-center font-semibold flex-shrink-0">
                  {idx + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-base font-semibold text-ink">{stop.name}</p>
                  {stop.address ? (
                    <p className="text-sm text-muted mt-1">
                      <MapPin size={12} className="inline-block mr-1 align-middle" aria-hidden="true" />
                      {stop.address}
                    </p>
                  ) : null}
                  {stop.notes ? (
                    <p className="text-sm text-ink leading-relaxed mt-2">{stop.notes}</p>
                  ) : null}
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>

      {trip.status === 'completed' && buddy ? (
        <section className="border border-border rounded-sm bg-surface p-6 text-center">
          <h2 className="text-lg font-semibold mb-1">How was your trip?</h2>
          <p className="text-sm text-muted mb-4">
            Leave a review for {buddy.profile?.full_name ?? 'your buddy'} so other travelers can
            benefit.
          </p>
          <Link
            href={`/review/${trip.id}`}
            className="inline-flex items-center gap-1 h-11 px-5 text-sm font-medium rounded-sm bg-primary text-paper border border-primary hover:bg-primary-hover"
          >
            <Star size={16} aria-hidden="true" />
            Review {buddy.profile?.full_name?.split(' ')[0] ?? 'Buddy'}
          </Link>
        </section>
      ) : null}
    </div>
  )
}
