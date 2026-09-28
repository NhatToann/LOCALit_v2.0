'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Plus, MapPin, Calendar } from 'lucide-react'
import { createClient } from '@/utils/supabase/auth'
import type { Trip } from '@/lib/types'
import { Avatar } from '@/components/ui/Avatar'

type FilterValue = 'all' | 'planned' | 'confirmed' | 'completed'

export default function TripsPage() {
  const [trips, setTrips] = useState<Trip[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<FilterValue>('all')
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data, error } = await supabase
        .from('trips')
        .select('*, buddy:buddies(*, profile:safe_profiles(full_name, avatar_url, is_online))')
        .eq('tourist_id', user.id)
        .order('start_date', { ascending: true })

      if (error) {
        setLoadError(error.message)
      }
      setTrips((data as Trip[]) || [])
      setLoading(false)
    }
    load()
  }, [])

  if (loading) {
    return (
      <div className="container-page py-16 text-center">
        <div className="loading-spinner mx-auto" />
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="container-page py-16">
        <div className="alert alert-error mb-4" role="alert">
          <span>{loadError}</span>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="ml-auto inline-flex items-center h-9 px-3 text-sm font-medium rounded-sm bg-transparent text-ink border border-border-strong hover:bg-paper"
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  const filtered = filter === 'all' ? trips : trips.filter((t) => t.status === filter)

  return (
    <div className="container-page py-8">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-eyebrow text-primary mb-2">Itineraries</p>
          <h1 className="text-page-title">My trips</h1>
          <p className="text-sm text-muted mt-1">
            {trips.length} {trips.length === 1 ? 'trip' : 'trips'} planned ·{' '}
            {trips.filter((t) => t.status === 'confirmed').length} confirmed
          </p>
        </div>
        <Link
          href="/tourist/trips/create"
          className="inline-flex items-center gap-1 h-10 px-4 text-sm font-medium rounded-sm bg-primary text-paper border border-primary hover:bg-primary-hover"
        >
          <Plus size={16} aria-hidden="true" />
          Plan a trip
        </Link>
      </header>

      {/* Filter chips */}
      <div className="flex flex-wrap gap-2 mb-6" role="tablist">
        {(['all', 'planned', 'confirmed', 'completed'] as const).map((f) => {
          const active = filter === f
          return (
            <button
              key={f}
              role="tab"
              aria-selected={active}
              onClick={() => setFilter(f)}
              className={`h-8 px-3 text-sm font-medium rounded-pill border transition-colors duration-150 capitalize ${
                active
                  ? 'bg-primary text-paper border-primary'
                  : 'bg-transparent text-muted border-border hover:text-ink hover:border-border-strong'
              }`}
            >
              {f}
            </button>
          )
        })}
      </div>

      {trips.length === 0 ? (
        <div className="border border-border rounded-sm p-12 bg-surface text-center">
          <h2 className="text-lg font-semibold mb-2">Plan your first trip to Da Nang</h2>
          <p className="text-sm text-muted max-w-md mx-auto mb-4">
            Set arrival dates, choose your interests, and we&apos;ll pair you with a verified local
            buddy who speaks your language and knows your travel style.
          </p>
          <Link
            href="/tourist/trips/create"
            className="inline-flex items-center gap-1 h-10 px-4 text-sm font-medium rounded-sm bg-primary text-paper border border-primary hover:bg-primary-hover"
          >
            <Plus size={16} aria-hidden="true" />
            Plan a trip
          </Link>
        </div>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-muted py-8 text-center">
          No trips in this section.
        </p>
      ) : (
        <ul className="divide-y divide-border border border-border rounded-sm bg-surface">
          {filtered.map((trip) => {
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
              <li key={trip.id}>
                <Link
                  href={`/tourist/trips/${trip.id}`}
                  className="block p-4 hover:bg-paper transition-colors duration-150"
                >
                  <div className="flex flex-wrap items-start gap-4">
                    <div className="flex-1 min-w-[240px]">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <span className={`badge ${statusBadge} text-xs`}>{trip.status}</span>
                        <span className="text-xs text-muted">
                          {trip.start_date ? (
                            <>
                              <Calendar size={12} className="inline-block mr-1 align-middle" aria-hidden="true" />
                              {new Date(trip.start_date).toLocaleDateString('en-US')}
                              {trip.end_date
                                ? ` – ${new Date(trip.end_date).toLocaleDateString('en-US')}`
                                : ''}
                            </>
                          ) : null}
                        </span>
                      </div>
                      <p className="text-base font-semibold text-ink">{trip.title}</p>
                      <p className="text-sm text-muted mt-1">
                        <MapPin size={12} className="inline-block mr-1 align-middle" aria-hidden="true" />
                        {trip.destination || 'Da Nang'}
                      </p>
                    </div>
                    {buddy ? (
                      <div className="flex items-center gap-2">
                        <Avatar
                          name={buddy.profile?.full_name ?? 'Buddy'}
                          size="sm"
                        />
                        <div>
                          <p className="text-xs text-muted">Local buddy</p>
                          <p className="text-sm font-medium text-ink">
                            {buddy.profile?.full_name ?? 'Assigned'}
                          </p>
                        </div>
                      </div>
                    ) : (
                      <span className="badge badge-warning text-xs">No buddy yet</span>
                    )}
                  </div>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
