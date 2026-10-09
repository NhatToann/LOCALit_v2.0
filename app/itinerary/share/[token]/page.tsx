'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/utils/supabase/auth'
import { MapPin, Calendar, ArrowLeft, AlertTriangle, Compass, Clock, Users, MapPinned } from 'lucide-react'
import Link from 'next/link'
import type { Itinerary, ItineraryDay, ItineraryStop, Profile } from '@/lib/types'
import { fmtTime, fmtRange, fmtMinutes, sortStops } from '@/lib/itinerary/times'

interface PageProps {
  params: Promise<{ token: string }>
}

/**
 * Public, read-only itinerary view. Accessed via the share link that
 * the owner generated from the board. Renders the same list-and-card
 * structure the owner sees, but without any edit affordances.
 */
export default function SharedItineraryPage({ params }: PageProps) {
  const [token, setToken] = useState<string | null>(null)
  const [itin, setItin] = useState<Itinerary | null>(null)
  const [owner, setOwner] = useState<Profile | null>(null)
  const [days, setDays] = useState<ItineraryDay[]>([])
  const [stops, setStops] = useState<ItineraryStop[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void params.then((p) => setToken(p.token))
  }, [params])

  useEffect(() => {
    if (!token) return
    void load(token)
  }, [token])

  async function load(t: string) {
    const sb = createClient()
    const { data: shareRow, error: shareErr } = await sb
      .from('itinerary_share')
      .select('itinerary_id, enabled, token')
      .eq('token', t)
      .maybeSingle()
    if (shareErr) {
      setError(shareErr.message)
      setLoading(false)
      return
    }
    if (!shareRow || !shareRow.enabled) {
      setError('This share link is invalid or has been disabled.')
      setLoading(false)
      return
    }
    const { data: itinRow, error: itinErr } = await sb
      .from('itineraries')
      .select('*')
      .eq('id', shareRow.itinerary_id)
      .maybeSingle<Itinerary>()
    if (itinErr || !itinRow) {
      setError(itinErr?.message ?? 'Trip not found.')
      setLoading(false)
      return
    }
    setItin(itinRow)

    const [{ data: ownerRow }, { data: d }, { data: s }] = await Promise.all([
      sb.from('safe_profiles').select('*').eq('id', itinRow.owner_id).maybeSingle<Profile>(),
      sb.from('itinerary_days').select('*').eq('itinerary_id', itinRow.id).order('day_order'),
      sb.from('itinerary_stops').select('*').eq('itinerary_id', itinRow.id).order('stop_order'),
    ])
    setOwner((ownerRow as Profile) ?? null)
    setDays((d as ItineraryDay[]) ?? [])
    setStops((s as ItineraryStop[]) ?? [])
    setLoading(false)
  }

  if (loading) {
    return (
      <main className="container-page py-16 text-center" aria-busy="true">
        <div className="loading-spinner mx-auto" />
        <p className="sr-only">Loading shared trip…</p>
      </main>
    )
  }

  if (error || !itin) {
    return (
      <main className="container-page py-16 max-w-md">
        <div className="border border-danger bg-danger-bg text-danger rounded-sm px-4 py-3 mb-4 flex items-center gap-2" role="alert">
          <AlertTriangle size={16} aria-hidden />
          <span>{error ?? 'Trip not found.'}</span>
        </div>
        <Link href="/" className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
          <ArrowLeft size={13} aria-hidden /> Back to home
        </Link>
      </main>
    )
  }

  return (
    <main className="container-page py-6 lg:py-8 space-y-6">
      <p className="text-[10px] text-subtle uppercase tracking-wider">
        Read-only trip · Powered by LOCALit
      </p>

      <header className="border border-border rounded-sm bg-surface p-5">
        <h1 className="text-page-title mb-1">{itin.title}</h1>
        <p className="text-sm text-muted inline-flex flex-wrap items-center gap-x-2 gap-y-1">
          <MapPin size={12} aria-hidden /> {itin.destination}
          {itin.start_date ? (
            <span className="inline-flex items-center gap-1 tabular-nums">
              <Calendar size={12} aria-hidden />
              {new Date(itin.start_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              {itin.end_date ? ` – ${new Date(itin.end_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })})` : ''}
            </span>
          ) : null}
          {owner ? (
            <span className="inline-flex items-center gap-1">
              <Users size={12} aria-hidden /> {owner.full_name}
            </span>
          ) : null}
        </p>
        {itin.notes ? (
          <p className="text-sm text-ink mt-3 leading-relaxed whitespace-pre-wrap border-t border-border pt-3">
            {itin.notes}
          </p>
        ) : null}
      </header>

      {days.length === 0 ? (
        <p className="text-sm text-muted">No lists yet.</p>
      ) : (
        <ol className="space-y-4">
          {days.map((d) => {
            const listStops = sortStops(stops.filter((s) => s.day_id === d.id))
            const range = fmtRange(d.start_time, d.end_time)
            return (
              <li key={d.id} className="border border-border rounded-sm bg-surface">
                <header className="px-4 py-2 border-b border-border bg-paper flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <h2 className="text-sm font-semibold">
                    {d.title || `List ${d.day_order}`}
                  </h2>
                  {d.date ? (
                    <span className="text-xs text-muted tabular-nums">
                      {new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </span>
                  ) : null}
                  {range ? (
                    <span className="text-xs text-muted inline-flex items-center gap-0.5 tabular-nums">
                      <Clock size={10} aria-hidden /> {range}
                    </span>
                  ) : null}
                  <span className="text-xs text-muted ml-auto">
                    {listStops.length} card{listStops.length === 1 ? '' : 's'}
                  </span>
                </header>
                {listStops.length === 0 ? (
                  <p className="px-4 py-3 text-sm text-muted italic">No cards yet.</p>
                ) : (
                  <ul className="divide-y divide-border">
                    {listStops.map((s) => {
                      const start = (s.start_time ?? s.planned_time)?.slice(0, 5) ?? ''
                      const end = s.end_time?.slice(0, 5) ?? ''
                      const time = end && end !== start ? `${start} – ${end}` : start
                      return (
                        <li key={s.id} className="flex items-start gap-3 px-4 py-2.5">
                          <span className="text-[10px] tabular-nums text-muted w-12 flex-shrink-0 mt-0.5">
                            {time || '—'}
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-ink">{s.name}</p>
                            <p className="text-[11px] text-muted inline-flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5">
                              {s.address ? (
                                <span className="inline-flex items-center gap-0.5 truncate">
                                  <MapPinned size={9} aria-hidden /> {s.address}
                                </span>
                              ) : null}
                              {s.duration_minutes ? (
                                <span className="inline-flex items-center gap-0.5 tabular-nums">
                                  <Clock size={9} aria-hidden /> {fmtMinutes(s.duration_minutes)}
                                </span>
                              ) : null}
                              {s.category ? (
                                <span className="inline-flex items-center gap-0.5 capitalize">
                                  <Compass size={9} aria-hidden /> {s.category}
                                </span>
                              ) : null}
                            </p>
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </li>
            )
          })}
        </ol>
      )}

      <footer className="border-t border-border pt-6">
        <p className="text-sm text-muted">
          Want to plan your own Da Nang trip with a verified local buddy?{' '}
          <Link href="/register?role=tourist" className="text-primary hover:underline font-medium">
            Create a free LOCALit account →
          </Link>
        </p>
      </footer>
    </main>
  )
}
