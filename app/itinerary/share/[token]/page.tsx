'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/utils/supabase/auth'
import { MapPin, Calendar, ArrowLeft, AlertTriangle } from 'lucide-react'
import Link from 'next/link'
import type { TripDay, TripStop } from '@/lib/types'
import { CATEGORY_ICONS } from '@/lib/popular-stops'

interface PageProps {
  params: Promise<{ token: string }>
}

interface SharedTrip {
  trip_id: string
  title: string
  destination: string
  start_date: string | null
  end_date: string | null
  currency: string
  budget_total_cents: number | null
  cover_photo_url: string | null
  itinerary_notes: string | null
  tourist: { id: string; full_name: string; avatar_url: string | null } | null
  buddy: { id: string; full_name: string; avatar_url: string | null; location_city: string | null } | null
}

export default function SharedItineraryPage({ params }: PageProps) {
  const [token, setToken] = useState<string | null>(null)
  const [trip, setTrip] = useState<SharedTrip | null>(null)
  const [days, setDays] = useState<TripDay[]>([])
  const [stops, setStops] = useState<TripStop[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    params.then((p) => setToken(p.token))
  }, [params])

  useEffect(() => {
    if (!token) return
    load(token)
  }, [token])

  async function load(t: string) {
    const supabase = createClient()
    const { data: tripRow, error: tripErr } = await supabase
      .from('shared_trip_view')
      .select('*')
      .eq('share_token', t)
      .maybeSingle()
    if (tripErr) {
      setError(tripErr.message)
      setLoading(false)
      return
    }
    if (!tripRow) {
      setError('This share link is invalid or has been removed.')
      setLoading(false)
      return
    }
    setTrip(tripRow as SharedTrip)
    const [{ data: d }, { data: s }] = await Promise.all([
      supabase
        .from('trip_days')
        .select('*')
        .eq('trip_id', tripRow.trip_id)
        .order('day_order', { ascending: true }),
      supabase
        .from('trip_stops')
        .select('*')
        .eq('trip_id', tripRow.trip_id)
        .order('stop_order', { ascending: true }),
    ])
    setDays((d as TripDay[]) || [])
    setStops((s as TripStop[]) || [])
    setLoading(false)
  }

  if (loading) return <div className="container-page py-16 text-center"><div className="loading-spinner mx-auto" /></div>

  if (error || !trip) {
    return (
      <div className="container-page py-16 max-w-md">
        <div className="alert alert-error" role="alert">
          <AlertTriangle size={16} aria-hidden="true" />
          <span>{error ?? 'Trip not found.'}</span>
        </div>
        <Link href="/" className="inline-flex items-center gap-1 mt-4 text-sm text-primary hover:underline">
          <ArrowLeft size={13} aria-hidden="true" /> Back to home
        </Link>
      </div>
    )
  }

  return (
    <div className="container-page py-6 space-y-6">
      <p className="text-xs text-subtle uppercase tracking-wider">
        Public read-only itinerary · Powered by LOCALit
      </p>
      <section className="border border-border rounded-sm bg-surface p-6">
        <h1 className="text-page-title mb-1">{trip.title}</h1>
        <p className="text-sm text-muted flex items-center gap-1 mb-4">
          <MapPin size={12} aria-hidden="true" /> {trip.destination}
          {trip.start_date && trip.end_date ? (
            <>
              {' '}·{' '}
              <Calendar size={12} aria-hidden="true" />
              {' '}
              {new Date(trip.start_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              {' – '}
              {new Date(trip.end_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </>
          ) : null}
        </p>
        {trip.tourist || trip.buddy ? (
          <div className="flex items-center gap-3 text-sm">
            {trip.tourist ? <span>👤 {trip.tourist.full_name}</span> : null}
            {trip.buddy ? <span>🧭 {trip.buddy.full_name}{trip.buddy.location_city ? ` (${trip.buddy.location_city})` : ''}</span> : null}
          </div>
        ) : null}
      </section>

      {trip.itinerary_notes ? (
        <section className="border border-border rounded-sm bg-surface p-6">
          <h2 className="text-lg font-semibold mb-2">Shared notes</h2>
          <pre className="whitespace-pre-wrap font-mono text-sm text-ink">{trip.itinerary_notes}</pre>
        </section>
      ) : null}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Stops</h2>
        {days.length === 0 ? (
          <p className="text-sm text-muted">No day-by-day plan yet.</p>
        ) : (
          days.map((d, idx) => {
            const dayStops = stops.filter((s) => s.day_id === d.id)
            return (
              <article key={d.id} className="border border-border rounded-sm bg-surface">
                <header className="px-4 py-2 border-b border-border bg-paper">
                  <p className="text-sm font-semibold">
                    {idx + 1}. {d.title ?? `Day ${idx + 1}`}
                  </p>
                </header>
                {dayStops.length === 0 ? (
                  <p className="px-4 py-3 text-sm text-muted italic">No stops yet.</p>
                ) : (
                  <ul className="divide-y divide-border">
                    {dayStops.map((s) => {
                      const Icon = CATEGORY_ICONS[s.category ?? 'sight']
                      return (
                        <li key={s.id} className="flex items-center gap-3 px-4 py-2">
                          <Icon size={13} className="text-primary flex-shrink-0" aria-hidden="true" />
                          <span className="flex-1 text-sm">{s.name}</span>
                          {s.address ? <span className="text-xs text-muted truncate">{s.address}</span> : null}
                        </li>
                      )
                    })}
                  </ul>
                )}
              </article>
            )
          })
        )}
      </section>

      <section className="border-t border-border pt-6">
        <p className="text-sm text-muted">
          Want to plan your own Da Nang trip with a verified local buddy?{' '}
          <Link href="/register?role=tourist" className="text-primary hover:underline font-medium">
            Create a free LOCALit account →
          </Link>
        </p>
      </section>
    </div>
  )
}
