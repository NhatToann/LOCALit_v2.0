'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/utils/supabase/auth'
import { MapPin, Calendar, ArrowLeft, AlertTriangle, Compass } from 'lucide-react'
import Link from 'next/link'
import type { Itinerary, ItineraryDay, ItineraryStop, Profile } from '@/lib/types'

interface PageProps {
  params: Promise<{ token: string }>
}

export default function SharedItineraryPage({ params }: PageProps) {
  const [token, setToken] = useState<string | null>(null)
  const [itin, setItin] = useState<Itinerary | null>(null)
  const [owner, setOwner] = useState<Profile | null>(null)
  const [days, setDays] = useState<ItineraryDay[]>([])
  const [stops, setStops] = useState<ItineraryStop[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => { params.then((p) => setToken(p.token)) }, [params])

  useEffect(() => {
    if (!token) return
    load(token)
  }, [token])

  async function load(t: string) {
    const supabase = createClient()
    // 1. Look up share row
    const { data: shareRow, error: shareErr } = await supabase
      .from('itinerary_share')
      .select('itinerary_id, enabled, token')
      .eq('token', t)
      .maybeSingle()
    if (shareErr) { setError(shareErr.message); setLoading(false); return }
    if (!shareRow || !shareRow.enabled) {
      setError('This share link is invalid or has been disabled.')
      setLoading(false)
      return
    }
    // 2. Load itinerary (allowed by RLS: itinerary_share_read is public)
    const { data: itinRow, error: itinErr } = await supabase
      .from('itineraries')
      .select('*')
      .eq('id', shareRow.itinerary_id)
      .maybeSingle<Itinerary>()
    if (itinErr || !itinRow) {
      setError(itinErr?.message ?? 'Itinerary not found.')
      setLoading(false)
      return
    }
    setItin(itinRow)
    // 3. Owner (public profile via safe_profiles)
    const { data: ownerRow } = await supabase
      .from('safe_profiles')
      .select('*')
      .eq('id', itinRow.owner_id)
      .maybeSingle<Profile>()
    setOwner((ownerRow as Profile) ?? null)
    // 4. Days + stops
    const [{ data: d }, { data: s }] = await Promise.all([
      supabase.from('itinerary_days').select('*').eq('itinerary_id', itinRow.id).order('day_order'),
      supabase.from('itinerary_stops').select('*').eq('itinerary_id', itinRow.id).order('stop_order'),
    ])
    setDays((d as ItineraryDay[]) ?? [])
    setStops((s as ItineraryStop[]) ?? [])
    setLoading(false)
  }

  if (loading) return <div className="container-page py-16 text-center"><div className="loading-spinner mx-auto" /></div>

  if (error || !itin) {
    return (
      <div className="container-page py-16 max-w-md">
        <div className="alert alert-error" role="alert">
          <AlertTriangle size={16} aria-hidden="true" />
          <span>{error ?? 'Itinerary not found.'}</span>
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
        <h1 className="text-page-title mb-1">{itin.title}</h1>
        <p className="text-sm text-muted flex items-center gap-1 mb-4">
          <MapPin size={12} aria-hidden="true" /> {itin.destination}
          {itin.start_date && itin.end_date ? (
            <>
              {' '}·{' '}
              <Calendar size={12} aria-hidden="true" />
              {' '}
              {new Date(itin.start_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              {' – '}
              {new Date(itin.end_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </>
          ) : null}
        </p>
        {owner ? (
          <p className="text-sm text-muted">
            <Compass size={13} className="inline mr-1 align-middle" aria-hidden="true" /> Planned by {owner.full_name}
          </p>
        ) : null}
      </section>

      {itin.notes ? (
        <section className="border border-border rounded-sm bg-surface p-6">
          <h2 className="text-lg font-semibold mb-2">Shared notes</h2>
          <p className="whitespace-pre-wrap text-sm text-ink leading-relaxed">{itin.notes}</p>
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
                    {dayStops.map((s) => (
                      <li key={s.id} className="flex items-center gap-3 px-4 py-2">
                        <MapPin size={13} className="text-primary flex-shrink-0" aria-hidden="true" />
                        <span className="flex-1 text-sm">{s.name}</span>
                        {s.address ? <span className="text-xs text-muted truncate">{s.address}</span> : null}
                      </li>
                    ))}
                  </ul>
                )}
              </article>
            )
          })
        )}
        {stops.filter((s) => !s.day_id).length > 0 ? (
          <article className="border border-border rounded-sm bg-surface">
            <header className="px-4 py-2 border-b border-border bg-paper">
              <p className="text-sm font-semibold">Other places</p>
            </header>
            <ul className="divide-y divide-border">
              {stops.filter((s) => !s.day_id).map((s) => (
                <li key={s.id} className="flex items-center gap-3 px-4 py-2">
                  <MapPin size={13} className="text-primary flex-shrink-0" aria-hidden="true" />
                  <span className="flex-1 text-sm">{s.name}</span>
                  {s.address ? <span className="text-xs text-muted truncate">{s.address}</span> : null}
                </li>
              ))}
            </ul>
          </article>
        ) : null}
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
