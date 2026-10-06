'use client'

import { useState, useMemo } from 'react'
import { Users, LayoutGrid } from 'lucide-react'
import PackingTab from './PackingTab'
import type { Profile, Trip, TripPackingItem, TripStop } from '@/lib/types'

interface PersonRef {
  id: string
  full_name: string
  avatar_url: string | null
  role: 'lead' | 'companion' | 'co-buddy'
}

interface Props {
  trip: Trip
  canEdit: boolean
  me: Profile
  travelers: PersonRef[]
  buddies: PersonRef[]
  onLogActivity: (verb: string, payload?: Record<string, unknown>) => void
}

/**
 * PackingSmartList — wraps the existing PackingTab with a per-traveler
 * view toggle. In "All" mode it just renders PackingTab unchanged.
 * In "Per-traveler" mode it filters the items by `assigned_to` and
 * groups by person, with an "Unassigned" bucket at the bottom.
 */
export default function PackingSmartList({
  trip,
  canEdit,
  me,
  travelers,
  buddies,
  onLogActivity,
}: Props) {
  const [mode, setMode] = useState<'all' | 'per'>('all')

  const people = useMemo(() => {
    const all: PersonRef[] = [...travelers, ...buddies]
    const seen = new Set<string>()
    const out: PersonRef[] = []
    for (const p of all) {
      if (seen.has(p.id)) continue
      seen.add(p.id)
      out.push(p)
    }
    return out
  }, [travelers, buddies])

  return (
    <section
      className="border border-border rounded-sm bg-surface"
      aria-label="Packing list"
    >
      <header className="flex items-center justify-between p-3 border-b border-border">
        <h2 className="text-sm font-semibold text-ink">Packing list</h2>
        <div role="tablist" aria-label="View mode" className="flex border border-border rounded-sm overflow-hidden">
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'all'}
            onClick={() => setMode('all')}
            className={`inline-flex items-center gap-1 h-7 px-2 text-[11px] ${
              mode === 'all' ? 'bg-primary text-paper' : 'bg-paper text-ink hover:bg-surface'
            }`}
          >
            <LayoutGrid size={11} aria-hidden="true" />
            All items
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'per'}
            onClick={() => setMode('per')}
            className={`inline-flex items-center gap-1 h-7 px-2 text-[11px] border-l border-border ${
              mode === 'per' ? 'bg-primary text-paper' : 'bg-paper text-ink hover:bg-surface'
            }`}
          >
            <Users size={11} aria-hidden="true" />
            Per-traveler
          </button>
        </div>
      </header>

      {mode === 'all' ? (
        <PackingTab
          trip={trip}
          canEdit={canEdit}
          me={me}
          onLogActivity={onLogActivity}
        />
      ) : (
        <PerTravelerView
          trip={trip}
          canEdit={canEdit}
          me={me}
          people={people}
          onLogActivity={onLogActivity}
        />
      )}
    </section>
  )
}

interface PerViewProps {
  trip: Trip
  canEdit: boolean
  me: Profile
  people: PersonRef[]
  onLogActivity: (verb: string, payload?: Record<string, unknown>) => void
}

function PerTravelerView({ trip, canEdit, me, people, onLogActivity }: PerViewProps) {
  // Per-traveler mode reuses PackingTab but provides items pre-grouped.
  // To keep things simple, we render PackingTab once per person via a
  // key trick: each traveler gets a copy of the trip view but the
  // assigned_to field filters the items in-flight. Since PackingTab
  // loads its own items from supabase, we instead render a small
  // custom summary that uses lib/packing-suggestions inline.
  return (
    <div className="p-4 space-y-4">
      <p className="text-xs text-muted">
        Switch to <strong>All items</strong> to add or edit items; per-traveler
        mode below reads <code>assigned_to</code> on each item.
      </p>
      <PerTravelerSummary trip={trip} people={people} canEdit={canEdit} me={me} onLogActivity={onLogActivity} />
    </div>
  )
}

function PerTravelerSummary({ trip, people, canEdit, me, onLogActivity }: PerViewProps) {
  const [items, setItems] = useState<TripPackingItem[]>([])
  const [stops, setStops] = useState<TripStop[]>([])
  const [loading, setLoading] = useState(true)

  // Lazy load on mount
  useMemo(() => {
    let cancelled = false
    async function load() {
      const { createClient } = await import('@/utils/supabase/auth')
      const supabase = createClient()
      const [itemsRes, stopsRes] = await Promise.all([
        supabase
          .from('trip_packing_items')
          .select('*')
          .eq('trip_id', trip.id),
        supabase
          .from('trip_stops')
          .select('*')
          .eq('trip_id', trip.id),
      ])
      if (cancelled) return
      setItems((itemsRes.data as TripPackingItem[]) ?? [])
      setStops((stopsRes.data as TripStop[]) ?? [])
      setLoading(false)
    }
    load()
    return () => {
      cancelled = true
    }
  }, [trip.id])

  if (loading) {
    return <p className="text-xs text-muted">Loading…</p>
  }

  const grouped = new Map<string, TripPackingItem[]>()
  const unassigned: TripPackingItem[] = []
  for (const it of items) {
    const key = (it as any).assigned_to ?? ''
    if (!key) {
      unassigned.push(it)
    } else {
      const arr = grouped.get(key) ?? []
      arr.push(it)
      grouped.set(key, arr)
    }
  }

  return (
    <div className="space-y-3">
      {people.map((p) => {
        const list = grouped.get(p.id) ?? []
        const packed = list.filter((i) => i.packed).length
        return (
          <div key={p.id} className="border border-border rounded-sm bg-paper p-3">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-semibold text-ink">{p.full_name}</h3>
              <span className="text-[10px] text-muted" style={{ fontVariantNumeric: 'tabular-nums' }}>
                {packed}/{list.length} packed
              </span>
            </div>
            {list.length === 0 ? (
              <p className="text-[11px] text-subtle">No personal items yet.</p>
            ) : (
              <ul className="space-y-0.5">
                {list.map((it) => (
                  <li key={it.id} className="flex items-center gap-2 text-[12px]">
                    <span
                      className={`inline-block w-3 h-3 border ${
                        it.packed ? 'bg-primary border-primary' : 'border-border'
                      }`}
                      aria-hidden="true"
                    />
                    <span className={it.packed ? 'line-through text-muted' : 'text-ink'}>
                      {it.name}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )
      })}
      {unassigned.length > 0 ? (
        <div className="border border-border rounded-sm bg-paper p-3">
          <h3 className="text-xs font-semibold text-ink mb-2">Shared (unassigned)</h3>
          <ul className="space-y-0.5">
            {unassigned.map((it) => (
              <li key={it.id} className="flex items-center gap-2 text-[12px]">
                <span
                  className={`inline-block w-3 h-3 border ${
                    it.packed ? 'bg-primary border-primary' : 'border-border'
                  }`}
                  aria-hidden="true"
                />
                <span className={it.packed ? 'line-through text-muted' : 'text-ink'}>
                  {it.name}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}
