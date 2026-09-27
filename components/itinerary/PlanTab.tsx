'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import {
  Check,
  Calendar,
  Sunrise,
  Sun,
  Moon,
  Backpack,
  Pencil,
} from 'lucide-react'
import { createClient } from '@/utils/supabase/auth'
import type { Trip, TripDay, TripStop, TripPackingItem, Profile } from '@/lib/types'
import { CATEGORY_ICONS } from '@/lib/popular-stops'
import { BUCKETS, bucketOf, type Bucket } from '@/lib/day-buckets'

interface Props {
  trip: Trip
  canEdit: boolean
  me: Profile
  onLogActivity: (verb: string, payload?: Record<string, unknown>) => void
  onTripUpdate: (t: Trip) => void
}

const BUCKET_ICONS: Record<Bucket, typeof Sunrise> = {
  morning: Sunrise,
  afternoon: Sun,
  evening: Moon,
}

export default function PlanTab({ trip, canEdit, me, onLogActivity, onTripUpdate }: Props) {
  const [days, setDays] = useState<TripDay[]>([])
  const [stops, setStops] = useState<TripStop[]>([])
  const [packing, setPacking] = useState<TripPackingItem[]>([])
  const [loading, setLoading] = useState(true)

  const [notes, setNotes] = useState(trip.itinerary_notes ?? '')
  const [saving, setSaving] = useState<'idle' | 'saving' | 'saved'>('idle')
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    setNotes(trip.itinerary_notes ?? '')
  }, [trip.id])

  useEffect(() => {
    load()
  }, [trip.id])

  async function load() {
    const supabase = createClient()
    const [{ data: d }, { data: s }, { data: p }] = await Promise.all([
      supabase.from('trip_days').select('*').eq('trip_id', trip.id).order('day_order', { ascending: true }),
      supabase.from('trip_stops').select('*').eq('trip_id', trip.id).order('stop_order', { ascending: true }),
      supabase.from('trip_packing_items').select('*').eq('trip_id', trip.id),
    ])
    setDays((d as TripDay[]) || [])
    setStops((s as TripStop[]) || [])
    setPacking((p as TripPackingItem[]) || [])
    setLoading(false)
  }

  const scheduleSave = useCallback(
    (next: string) => {
      if (!canEdit) return
      if (saveTimer.current) clearTimeout(saveTimer.current)
      setSaving('saving')
      saveTimer.current = setTimeout(async () => {
        const supabase = createClient()
        await supabase
          .from('trips')
          .update({
            itinerary_notes: next,
            itinerary_updated_by: me.id,
            itinerary_updated_at: new Date().toISOString(),
          })
          .eq('id', trip.id)
        setSaving('saved')
        onTripUpdate({ ...trip, itinerary_notes: next, itinerary_updated_by: me.id, itinerary_updated_at: new Date().toISOString() })
        onLogActivity('edited_notes', { length: next.length })
      }, 1200)
    },
    [canEdit, me.id, trip, onLogActivity, onTripUpdate],
  )

  function onChange(v: string) {
    setNotes(v)
    scheduleSave(v)
  }

  const packed = packing.filter((p) => p.is_packed).length
  const total = packing.length
  const pct = total > 0 ? Math.round((packed / total) * 100) : 0

  if (loading) {
    return <div className="loading-spinner mx-auto my-8" />
  }

  const lastEditorName =
    trip.itinerary_updated_by === me.id
      ? 'you'
      : trip.itinerary_editor?.full_name ??
        (trip.itinerary_updated_by ? 'your buddy' : null)

  return (
    <div className="space-y-6">
      {/* Trip meta */}
      <header className="border border-border rounded-sm bg-paper p-4">
        <p className="text-eyebrow text-primary mb-1">At a glance</p>
        <h2 className="text-section-title">{trip.title ?? 'Da Nang itinerary'}</h2>
        <p className="text-sm text-muted mt-1">
          {days.length === 0
            ? 'No days planned yet. Open the Days & Map tab to start.'
            : `${days.length} day${days.length === 1 ? '' : 's'} · ${stops.length} stop${stops.length === 1 ? '' : 's'} planned`}
        </p>
      </header>

      {/* Day-by-day summary */}
      <section>
        <header className="flex items-center justify-between mb-3">
          <h3 className="text-section-title">Day by day</h3>
          <span className="text-xs text-muted">
            {lastEditorName
              ? `Last edited by ${lastEditorName}${
                  trip.itinerary_updated_at
                    ? ` · ${new Date(trip.itinerary_updated_at).toLocaleString('en-US')}`
                    : ''
                }`
              : 'No edits yet'}
          </span>
        </header>

        {days.length === 0 ? (
          <div className="border border-dashed border-border rounded-sm p-6 text-center bg-paper">
            <p className="text-sm text-muted">
              Add a day on the Days & Map tab to start grouping stops into morning, afternoon, and evening.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {days.map((day, idx) => {
              const dayStops = stops.filter((s) => s.day_id === day.id)
              const grouped: Record<Bucket, TripStop[]> = {
                morning: [],
                afternoon: [],
                evening: [],
              }
              for (const s of dayStops) {
                grouped[bucketOf(s.planned_time)].push(s)
              }
              const hasAnyStops = dayStops.length > 0
              return (
                <article
                  key={day.id}
                  className="border border-border rounded-sm bg-surface overflow-hidden"
                  aria-label={day.title ?? `Day ${idx + 1}`}
                >
                  <header className="flex items-center gap-3 px-4 py-3 border-b border-border bg-paper">
                    <span className="inline-flex items-center justify-center w-7 h-7 rounded-sm bg-primary text-paper text-xs font-semibold">
                      {idx + 1}
                    </span>
                    <h4 className="text-sm font-semibold flex-1">{day.title}</h4>
                    <span className="text-[11px] text-muted">
                      {dayStops.length} stop{dayStops.length === 1 ? '' : 's'}
                    </span>
                  </header>
                  {!hasAnyStops ? (
                    <p className="px-4 py-4 text-xs text-muted italic">No stops yet</p>
                  ) : (
                    <div className="divide-y divide-border">
                      {BUCKETS.map((b) => {
                        const items = grouped[b]
                        if (items.length === 0) return null
                        const Icon = BUCKET_ICONS[b]
                        return (
                          <div key={b} className="px-4 py-3">
                            <h5 className="text-[11px] uppercase tracking-wider text-muted mb-2 flex items-center gap-1.5">
                              <Icon size={11} aria-hidden="true" />
                              {b}
                            </h5>
                            <ul className="space-y-1.5">
                              {items.map((s) => {
                                const CatIcon = CATEGORY_ICONS[s.category ?? 'sight']
                                return (
                                  <li
                                    key={s.id}
                                    className="flex items-start gap-3 border border-border rounded-sm bg-paper px-3 py-2"
                                  >
                                    <CatIcon
                                      size={14}
                                      className="text-primary mt-0.5 flex-shrink-0"
                                      aria-hidden="true"
                                    />
                                    <div className="flex-1 min-w-0">
                                      <p className="text-sm text-ink truncate">{s.name}</p>
                                      {s.address ? (
                                        <p className="text-[11px] text-muted truncate">
                                          {s.address}
                                        </p>
                                      ) : null}
                                    </div>
                                    {s.planned_time ? (
                                      <span className="text-[11px] text-muted whitespace-nowrap font-mono">
                                        {s.planned_time.slice(0, 5)}
                                      </span>
                                    ) : null}
                                  </li>
                                )
                              })}
                            </ul>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </article>
              )
            })}
          </div>
        )}
      </section>

      {/* Packing summary */}
      <section>
        <header className="flex items-center justify-between mb-3">
          <h3 className="text-section-title">Packing</h3>
          <span className="text-xs text-muted">
            {packed} / {total} packed
          </span>
        </header>
        <div className="border border-border rounded-sm bg-surface p-4">
          <div className="flex items-center gap-3 mb-3">
            <div className="flex-1 h-2 bg-paper border border-border rounded-sm overflow-hidden">
              <div
                className="h-full bg-success transition-all duration-300"
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="text-xs text-muted whitespace-nowrap">{pct}%</span>
          </div>
          <p className="text-xs text-muted">
            {total === 0
              ? 'No packing items yet. Open the Packing tab to start.'
              : `${total} item${total === 1 ? '' : 's'} across ${packingByCategory(packing).length} categor${packingByCategory(packing).length === 1 ? 'y' : 'ies'}.`}
          </p>
        </div>
      </section>

      {/* Notes — always visible editor at the bottom */}
      <section>
        <header className="flex items-center justify-between mb-2">
          <h3 className="text-section-title flex items-center gap-2">
            <Pencil size={14} aria-hidden="true" />
            Shared notes
          </h3>
          <span className="text-xs text-muted inline-flex items-center gap-1">
            {saving === 'saving' ? (
              <>
                <span className="loading-spinner w-3 h-3" aria-hidden="true" /> Saving…
              </>
            ) : saving === 'saved' ? (
              <>
                <Check size={12} className="text-success" aria-hidden="true" /> Saved
              </>
            ) : null}
          </span>
        </header>
        <textarea
          value={notes}
          onChange={(e) => onChange(e.target.value)}
          disabled={!canEdit}
          rows={8}
          maxLength={8000}
          aria-label="Shared itinerary notes"
          placeholder="Sketch the trip here — both of you can edit. Markdown supported."
          className="w-full p-3 border border-border rounded-sm bg-paper text-sm text-ink leading-relaxed focus:outline-none focus:border-primary"
        />
        <p className="text-xs text-muted mt-1">
          Autosaves 1.2 s after your last keystroke.
        </p>
      </section>
    </div>
  )
}

function packingByCategory(items: TripPackingItem[]): string[] {
  return Array.from(new Set(items.map((i) => i.category)))
}
