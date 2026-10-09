'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Plus, MapPin, Calendar, Compass, Loader2, AlertTriangle, Inbox, LayoutGrid } from 'lucide-react'
import { createClient } from '@/utils/supabase/auth'
import type { Itinerary } from '@/lib/types'

/**
 * All-trips landing page. Flat list of every itinerary the user can
 * see (own + accepted collaborator). Click a row → board view.
 */
export default function ItineraryListPage() {
  const router = useRouter()
  const [items, setItems] = useState<Itinerary[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoadError(null)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      router.push('/login?redirect=/itinerary')
      return
    }
    const { data, error } = await supabase
      .from('itineraries')
      .select(
        '*, owner:safe_profiles!itineraries_owner_id_fkey(full_name, avatar_url), stops:itinerary_stops(id), collaborators:itinerary_collaborators(id, status)',
      )
      .order('start_date', { ascending: true, nullsFirst: false })
    if (error) {
      setLoadError(error.message)
      setLoading(false)
      return
    }
    // Dedupe (own + collaborator matches can collide).
    const map = new Map<string, Itinerary>()
    for (const row of (data || []) as Itinerary[]) map.set(row.id, row)
    setItems([...map.values()])
    setLoading(false)
  }, [router])

  useEffect(() => {
    void load()
  }, [load])

  if (loading) {
    return (
      <main className="container-page py-16 text-center" aria-busy="true">
        <Loader2 size={20} className="animate-spin mx-auto text-muted" />
        <p className="sr-only">Loading trips…</p>
      </main>
    )
  }

  return (
    <main className="container-page py-6 lg:py-8 space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3 pb-4 border-b border-border">
        <div>
          <p className="text-eyebrow text-primary mb-2">
            Trips
            <span
              className="ml-2 italic text-muted"
              style={{ letterSpacing: '0.02em' }}
              aria-hidden
            >
              lịch trình
            </span>
          </p>
          <h1 className="text-page-title">Your trips</h1>
          <p className="text-sm text-muted mt-1" style={{ fontVariantNumeric: 'tabular-nums' }}>
            {items.length} trip{items.length === 1 ? '' : 's'}
          </p>
        </div>
        <Link
          href="/itinerary/new"
          className="inline-flex items-center gap-1 h-10 px-4 text-sm font-medium rounded-sm bg-primary text-paper border border-primary hover:bg-primary-hover"
        >
          <Plus size={16} aria-hidden="true" />
          New trip
        </Link>
      </header>

      {loadError ? (
        <div className="border border-danger bg-danger-bg text-danger rounded-sm px-4 py-3 flex items-center gap-2" role="alert">
          <AlertTriangle size={14} aria-hidden />
          <span>{loadError}</span>
        </div>
      ) : null}

      {items.length === 0 ? (
        <div className="border border-dashed border-border rounded-sm bg-paper p-12 text-center">
          <Inbox size={20} className="mx-auto text-muted mb-2" aria-hidden />
          <h2 className="text-base font-semibold mb-1">No trips yet</h2>
          <p className="text-sm text-muted max-w-md mx-auto mb-4">
            Plan your first Da Nang trip. Add lists for each day or window, then drop cards into them.
          </p>
          <Link
            href="/itinerary/new"
            className="inline-flex items-center gap-1 h-10 px-4 text-sm font-medium rounded-sm bg-primary text-paper border border-primary hover:bg-primary-hover"
          >
            <Plus size={16} aria-hidden /> New trip
          </Link>
        </div>
      ) : (
        <ul className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {items.map((itin) => {
            const stopCount = Array.isArray((itin as any).stops) ? (itin as any).stops.length : 0
            const collabCount = Array.isArray((itin as any).collaborators) ? (itin as any).collaborators.length : 0
            const statusBadge =
              itin.status === 'confirmed' ? 'badge-success'
                : itin.status === 'completed' ? 'badge-info'
                  : itin.status === 'cancelled' ? 'badge-danger'
                    : 'badge-warning'
            return (
              <li key={itin.id}>
                <Link
                  href={`/itinerary/${itin.id}`}
                  className="block p-4 border border-border rounded-sm bg-surface hover:border-border-strong transition-colors"
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <h2 className="text-base font-semibold text-ink truncate flex-1">{itin.title}</h2>
                    <span className={`badge ${statusBadge} text-[10px] flex-shrink-0`}>{itin.status}</span>
                  </div>
                  <p className="text-xs text-muted inline-flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="inline-flex items-center gap-1">
                      <MapPin size={11} aria-hidden /> {itin.destination || 'Da Nang'}
                    </span>
                    {itin.start_date ? (
                      <span className="inline-flex items-center gap-1 tabular-nums">
                        <Calendar size={11} aria-hidden /> {new Date(itin.start_date).toLocaleDateString('en-US')}
                        {itin.end_date ? ` – ${new Date(itin.end_date).toLocaleDateString('en-US')}` : ''}
                      </span>
                    ) : null}
                  </p>
                  <div className="mt-3 flex items-center gap-3 text-[11px] text-muted">
                    <span className="inline-flex items-center gap-1">
                      <LayoutGrid size={11} aria-hidden /> {stopCount} card{stopCount === 1 ? '' : 's'}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Compass size={11} aria-hidden /> {collabCount} collaborator{collabCount === 1 ? '' : 's'}
                    </span>
                  </div>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </main>
  )
}
