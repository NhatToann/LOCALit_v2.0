'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Plus, MapPin, Calendar, Compass, Loader2, AlertTriangle, Inbox } from 'lucide-react'
import { createClient } from '@/utils/supabase/auth'
import type { Itinerary } from '@/lib/types'

type Filter = 'all' | 'planning' | 'confirmed' | 'completed' | 'cancelled'

export default function ItineraryListPage() {
  const router = useRouter()
  const [items, setItems] = useState<Itinerary[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [filter, setFilter] = useState<Filter>('all')

  const load = useCallback(async () => {
    setLoadError(null)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      router.push('/login?redirect=/itinerary')
      return
    }
    // 2 separate queries — PostgREST's .or() cannot resolve a nested
    // relationship filter like collaborators.user_id.eq.X. The schema's
    // own RLS already enforces that users only see itineraries they own
    // or collaborate on, so we don't need to filter at the query level
    // for security; we use the two queries only for completeness across
    // owner + collaborator joins.
    const { data, error } = await supabase
      .from('itineraries')
      .select(
        '*, owner:safe_profiles!itineraries_owner_id_fkey(full_name, avatar_url), stops:itinerary_stops(id), collaborators:itinerary_collaborators(id, status)',
      )
      .order('start_date', { ascending: true, nullsFirst: false })
    if (error) { setLoadError(error.message); setLoading(false); return }
    // Dedupe (own + collaborator matches can collide if a user has both)
    const map = new Map<string, Itinerary>()
    for (const row of (data || []) as Itinerary[]) map.set(row.id, row)
    setItems([...map.values()])
    setLoading(false)
  }, [router])

  useEffect(() => { load() }, [load])

  const filtered = filter === 'all' ? items : items.filter((i) => i.status === filter)
  const counts = {
    all: items.length,
    planning: items.filter((i) => i.status === 'planning').length,
    confirmed: items.filter((i) => i.status === 'confirmed').length,
    completed: items.filter((i) => i.status === 'completed').length,
    cancelled: items.filter((i) => i.status === 'cancelled').length,
  }

  if (loading) {
    return (
      <div className="container-page py-16 text-center">
        <Loader2 size={20} className="animate-spin mx-auto text-muted" />
      </div>
    )
  }

  return (
    <div className="container-page py-6 lg:py-8 space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3 pb-4 border-b border-border">
        <div>
          <p className="text-eyebrow text-primary mb-2">
            Itineraries
            <span className="ml-2 italic text-muted" style={{ letterSpacing: '0.02em' }} aria-hidden="true">
              lịch trình
            </span>
          </p>
          <h1 className="text-page-title">Your itineraries</h1>
          <p className="text-sm text-muted mt-1" style={{ fontVariantNumeric: 'tabular-nums' }}>
            {items.length} total · {counts.planning} planning · {counts.confirmed} confirmed
          </p>
        </div>
        <Link
          href="/itinerary/new"
          className="inline-flex items-center gap-1 h-10 px-4 text-sm font-medium rounded-sm bg-primary text-paper border border-primary hover:bg-primary-hover"
        >
          <Plus size={16} aria-hidden="true" />
          Plan an itinerary
        </Link>
      </header>

      <div className="flex flex-wrap gap-2" role="tablist">
        {([
          { v: 'all', label: 'All' },
          { v: 'planning', label: 'Planning' },
          { v: 'confirmed', label: 'Confirmed' },
          { v: 'completed', label: 'Completed' },
          { v: 'cancelled', label: 'Cancelled' },
        ] as const).map((f) => {
          const active = filter === f.v
          return (
            <button
              key={f.v}
              role="tab"
              aria-selected={active}
              onClick={() => setFilter(f.v)}
              className={`h-9 px-3 text-sm font-medium border transition-colors duration-150 ${
                active
                  ? 'bg-primary text-paper border-primary'
                  : 'bg-transparent text-muted border-border hover:text-ink hover:border-border-strong'
              }`}
            >
              {f.label} ({counts[f.v]})
            </button>
          )
        })}
      </div>

      {loadError ? (
        <div className="alert alert-error" role="alert">
          <AlertTriangle size={14} aria-hidden="true" />
          <span>{loadError}</span>
        </div>
      ) : null}

      {items.length === 0 ? (
        <div className="border border-border rounded-sm p-12 bg-[#FFFFFF] text-center">
          <Inbox size={20} className="mx-auto text-muted mb-2" aria-hidden="true" />
          <h2 className="text-base font-semibold mb-1">No itineraries yet</h2>
          <p className="text-sm text-muted max-w-md mx-auto mb-4">
            Plan your first Da Nang trip. You can add stops, days, and invite collaborators.
          </p>
          <Link
            href="/itinerary/new"
            className="inline-flex items-center gap-1 h-10 px-4 text-sm font-medium rounded-sm bg-primary text-paper border border-primary hover:bg-primary-hover"
          >
            <Plus size={16} aria-hidden="true" />
            Plan an itinerary
          </Link>
        </div>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-muted py-8 text-center">No itineraries in this section.</p>
      ) : (
        <ul className="divide-y divide-border border border-border rounded-sm bg-[#FFFFFF]">
          {filtered.map((itin) => {
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
                  className="block p-4 hover:bg-paper transition-colors duration-150"
                >
                  <div className="flex flex-wrap items-start gap-3">
                    <div className="flex-1 min-w-[240px]">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <span className={`badge ${statusBadge} text-xs`}>{itin.status}</span>
                        <span
                          className="text-xs text-muted"
                          style={{
                            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                            fontVariantNumeric: 'tabular-nums',
                          }}
                        >
                          {itin.start_date ? (
                            <>
                              <Calendar size={12} className="inline-block mr-1 align-middle" aria-hidden="true" />
                              {new Date(itin.start_date).toLocaleDateString('en-US')}
                              {itin.end_date ? ` – ${new Date(itin.end_date).toLocaleDateString('en-US')}` : ''}
                            </>
                          ) : null}
                        </span>
                        {collabCount > 0 ? (
                          <span className="text-xs text-muted">+{collabCount} collaborator{collabCount === 1 ? '' : 's'}</span>
                        ) : null}
                      </div>
                      <p className="text-base font-semibold text-ink">{itin.title}</p>
                      <p className="text-sm text-muted mt-1 inline-flex items-center gap-1">
                        <MapPin size={12} aria-hidden="true" /> {itin.destination || 'Da Nang'}
                        <span className="mx-2 text-border-strong">·</span>
                        <Compass size={12} aria-hidden="true" /> {stopCount} stop{stopCount === 1 ? '' : 's'}
                      </p>
                    </div>
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
