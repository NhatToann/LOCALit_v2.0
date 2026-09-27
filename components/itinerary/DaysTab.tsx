'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/utils/supabase/auth'
import type { Trip, TripDay, TripStop, Profile } from '@/lib/types'
import dynamic from 'next/dynamic'
import {
  Plus,
  X,
  Trash2,
  Sunrise,
  Sun,
  Moon,
} from 'lucide-react'
import {
  BUCKETS,
  bucketOf,
  defaultTimeForBucket,
  type Bucket,
} from '@/lib/day-buckets'
import { CATEGORY_ICONS } from '@/lib/popular-stops'

const StopMapPicker = dynamic(() => import('@/components/itinerary/StopMapPicker'), {
  ssr: false,
})

interface Props {
  trip: Trip
  canEdit: boolean
  me: Profile
  onLogActivity: (verb: string, payload?: Record<string, unknown>) => void
}

const BUCKET_ICONS: Record<Bucket, typeof Sunrise> = {
  morning: Sunrise,
  afternoon: Sun,
  evening: Moon,
}

const BUCKET_LABEL: Record<Bucket, string> = {
  morning: 'Morning',
  afternoon: 'Afternoon',
  evening: 'Evening',
}

const CATEGORIES: Array<NonNullable<TripStop['category']>> = [
  'food',
  'sight',
  'transport',
  'stay',
  'activity',
  'other',
]

export default function DaysTab({ trip, canEdit, me, onLogActivity }: Props) {
  const [days, setDays] = useState<TripDay[]>([])
  const [stops, setStops] = useState<TripStop[]>([])
  const [loading, setLoading] = useState(true)
  const [activeDayId, setActiveDayId] = useState<string | null>(null)
  const [pickerOpenFor, setPickerOpenFor] = useState<Bucket | null>(null)

  useEffect(() => {
    load()
  }, [trip.id])

  // Realtime: stops + days
  useEffect(() => {
    if (!trip) return
    const supabase = createClient()
    const ch = supabase
      .channel(`days-${trip.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'trip_stops' }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'trip_days' }, () => load())
      .subscribe()
    return () => {
      supabase.removeChannel(ch)
    }
  }, [trip.id])

  async function load() {
    const supabase = createClient()
    const [{ data: d }, { data: s }] = await Promise.all([
      supabase
        .from('trip_days')
        .select('*')
        .eq('trip_id', trip.id)
        .order('day_order', { ascending: true }),
      supabase
        .from('trip_stops')
        .select('*')
        .eq('trip_id', trip.id)
        .order('stop_order', { ascending: true }),
    ])
    const newDays = (d as TripDay[]) || []
    const newStops = (s as TripStop[]) || []
    setDays(newDays)
    setStops(newStops)
    setLoading(false)
    if (!activeDayId && newDays.length > 0) {
      setActiveDayId(newDays[0].id)
    }
    if (activeDayId && !newDays.some((x) => x.id === activeDayId)) {
      setActiveDayId(newDays[0]?.id ?? null)
    }
  }

  // ---- Day CRUD ----

  async function addDay() {
    if (!canEdit) return
    const supabase = createClient()
    const nextOrder = days.length
    const { data } = await supabase
      .from('trip_days')
      .insert({
        trip_id: trip.id,
        day_order: nextOrder,
        title: `Day ${nextOrder + 1}`,
      })
      .select()
    const newDay = Array.isArray(data) ? data[0] : null
    onLogActivity('added_day', { day_id: newDay?.id })
    await load()
    if (newDay) setActiveDayId(newDay.id)
  }

  async function renameDay(day: TripDay, title: string) {
    if (!canEdit) return
    if (!title.trim() || title === day.title) return
    const supabase = createClient()
    await supabase.from('trip_days').update({ title }).eq('id', day.id)
    onLogActivity('renamed_day', { day_id: day.id, title })
    load()
  }

  async function updateDayDate(day: TripDay, date: string | null) {
    if (!canEdit) return
    const supabase = createClient()
    await supabase.from('trip_days').update({ date }).eq('id', day.id)
    load()
  }

  async function updateDayNotes(day: TripDay, notes: string) {
    if (!canEdit) return
    const supabase = createClient()
    await supabase.from('trip_days').update({ notes }).eq('id', day.id)
    load()
  }

  async function deleteDay(dayId: string) {
    if (!canEdit) return
    if (!confirm('Delete this day and all its stops?')) return
    const supabase = createClient()
    await supabase.from('trip_days').delete().eq('id', dayId)
    onLogActivity('deleted_day', { day_id: dayId })
    load()
  }

  // ---- Stop CRUD ----

  async function updateStop(stop: TripStop, patch: Partial<TripStop>) {
    if (!canEdit) return
    const supabase = createClient()
    await supabase.from('trip_stops').update(patch).eq('id', stop.id)
    load()
  }

  async function removeStop(stopId: string) {
    if (!canEdit) return
    const supabase = createClient()
    await supabase.from('trip_stops').delete().eq('id', stopId)
    load()
  }

  // ---- View ----

  if (loading) {
    return <div className="loading-spinner mx-auto my-8" />
  }

  const activeDay = days.find((d) => d.id === activeDayId) ?? null
  const activeDayStops = activeDay ? stops.filter((s) => s.day_id === activeDay.id) : []
  const activeDayOrder = activeDay ? days.findIndex((d) => d.id === activeDay.id) : 0

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_400px] gap-4">
      <div className="space-y-3">
        {/* Day pills */}
        <div
          role="tablist"
          aria-label="Days"
          className="flex items-center gap-2 flex-wrap"
        >
          {days.map((day, idx) => {
            const isActive = day.id === activeDayId
            return (
              <button
                key={day.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => setActiveDayId(day.id)}
                className={`inline-flex items-center gap-1 h-9 px-3 text-sm rounded-sm border ${
                  isActive
                    ? 'bg-primary text-paper border-primary'
                    : 'bg-surface text-ink border-border hover:border-border-strong'
                }`}
              >
                <span className="inline-flex items-center justify-center w-5 h-5 rounded-sm bg-paper text-ink text-[10px] font-semibold">
                  {idx + 1}
                </span>
                <span className="truncate max-w-[160px]">{day.title}</span>
              </button>
            )
          })}
          {canEdit ? (
            <button
              type="button"
              onClick={addDay}
              className="inline-flex items-center gap-1 h-9 px-3 text-sm rounded-sm border border-dashed border-border-strong text-muted hover:text-ink hover:border-primary"
            >
              <Plus size={13} aria-hidden="true" /> Add day
            </button>
          ) : null}
        </div>

        {!activeDay ? (
          <div className="border border-dashed border-border rounded-sm p-8 text-center bg-paper">
            <p className="text-sm text-muted mb-3">
              No days yet. Break the trip into days to organize stops.
            </p>
            {canEdit ? (
              <button
                type="button"
                onClick={addDay}
                className="inline-flex items-center gap-1 h-9 px-4 text-sm rounded-sm bg-primary text-paper border border-primary hover:bg-primary-hover"
              >
                <Plus size={13} aria-hidden="true" /> Add Day 1
              </button>
            ) : null}
          </div>
        ) : (
          <>
            {/* Parent day form */}
            <article className="border border-border rounded-sm bg-surface overflow-hidden">
              <header className="flex items-center gap-3 px-4 py-3 border-b border-border bg-paper">
                <span className="inline-flex items-center justify-center w-7 h-7 rounded-sm bg-primary text-paper text-xs font-semibold">
                  {activeDayOrder + 1}
                </span>
                {canEdit ? (
                  <input
                    defaultValue={activeDay.title ?? ''}
                    onBlur={(e) => renameDay(activeDay, e.target.value.trim())}
                    aria-label="Day title"
                    className="text-base font-semibold bg-transparent border-b border-transparent hover:border-border focus:border-primary focus:outline-none flex-1 min-w-0"
                  />
                ) : (
                  <h3 className="text-base font-semibold flex-1">{activeDay.title}</h3>
                )}
                {canEdit ? (
                  <button
                    type="button"
                    onClick={() => deleteDay(activeDay.id)}
                    aria-label="Delete day"
                    className="text-muted hover:text-danger"
                  >
                    <Trash2 size={14} aria-hidden="true" />
                  </button>
                ) : null}
              </header>
              <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-xs text-muted">Date</span>
                  <input
                    type="date"
                    defaultValue={activeDay.date ?? ''}
                    onChange={(e) =>
                      updateDayDate(activeDay, e.target.value || null)
                    }
                    disabled={!canEdit}
                    className="form-input mt-1"
                  />
                </label>
                <label className="block">
                  <span className="text-xs text-muted">Notes for the day</span>
                  <input
                    type="text"
                    defaultValue={activeDay.notes ?? ''}
                    onBlur={(e) => {
                      if (e.target.value !== (activeDay.notes ?? '')) {
                        updateDayNotes(activeDay, e.target.value)
                      }
                    }}
                    disabled={!canEdit}
                    placeholder="e.g. Easy day, indoor backup if it rains"
                    className="form-input mt-1"
                  />
                </label>
              </div>
            </article>

            {/* Child bucket forms */}
            <div className="space-y-3">
              {BUCKETS.map((b) => {
                const bucketStops = activeDayStops.filter(
                  (s) => bucketOf(s.planned_time) === b,
                )
                const Icon = BUCKET_ICONS[b]
                return (
                  <section
                    key={b}
                    aria-label={`${BUCKET_LABEL[b]} stops`}
                    className="border border-border rounded-sm bg-paper overflow-hidden"
                  >
                    <header className="flex items-center justify-between gap-2 px-4 py-2.5 border-b border-border bg-surface">
                      <h4 className="text-sm font-semibold flex items-center gap-2">
                        <Icon size={14} className="text-primary" aria-hidden="true" />
                        {BUCKET_LABEL[b]}
                      </h4>
                      <span className="text-[11px] text-muted">
                        {bucketStops.length} stop{bucketStops.length === 1 ? '' : 's'}
                      </span>
                    </header>
                    <ul className="px-4 py-3 space-y-2">
                      {bucketStops.length === 0 ? (
                        <li className="text-xs text-muted italic py-2">
                          No {BUCKET_LABEL[b].toLowerCase()} stops yet
                        </li>
                      ) : (
                        bucketStops.map((s) => (
                          <StopRow
                            key={s.id}
                            stop={s}
                            canEdit={canEdit}
                            onChange={(patch) => updateStop(s, patch)}
                            onRemove={() => removeStop(s.id)}
                          />
                        ))
                      )}
                    </ul>
                    {canEdit ? (
                      <footer className="border-t border-border px-4 py-2 bg-paper">
                        <button
                          type="button"
                          onClick={() => setPickerOpenFor(b)}
                          className="inline-flex items-center gap-1 h-7 px-2.5 text-xs font-medium rounded-sm bg-transparent text-primary border border-primary hover:bg-primary hover:text-paper"
                        >
                          <Plus size={11} aria-hidden="true" /> Add {BUCKET_LABEL[b].toLowerCase()} stop
                        </button>
                      </footer>
                    ) : null}
                  </section>
                )
              })}
            </div>
          </>
        )}
      </div>

      {/* Map picker sidebar */}
      <aside
        className="border border-border rounded-sm bg-surface overflow-hidden lg:sticky lg:top-20 self-start"
        aria-label="Add a stop"
      >
        {activeDay && pickerOpenFor ? (
          <StopMapPicker
            tripId={trip.id}
            dayId={activeDay.id}
            dayOrder={activeDayOrder}
            existingStops={activeDayStops}
            onAdded={(s) => {
              // Force bucket by setting planned_time
              const t = defaultTimeForBucket(pickerOpenFor)
              updateStop(s, { planned_time: t })
              setPickerOpenFor(null)
            }}
            onCancel={() => setPickerOpenFor(null)}
          />
        ) : (
          <div className="flex flex-col">
            <header className="px-4 py-3 border-b border-border">
              <p className="text-eyebrow text-muted mb-1">Map</p>
              <p className="text-xs text-subtle">
                Click <strong className="text-ink">Add morning / afternoon / evening stop</strong> below to drop a pin.
              </p>
            </header>
            <div className="p-4 space-y-2">
              {canEdit && activeDay ? (
                BUCKETS.map((b) => {
                  const Icon = BUCKET_ICONS[b]
                  return (
                    <button
                      key={b}
                      type="button"
                      onClick={() => setPickerOpenFor(b)}
                      className="w-full flex items-center gap-2 h-10 px-3 text-sm rounded-sm border border-border-strong bg-paper text-ink hover:border-primary hover:text-primary"
                    >
                      <Icon size={13} aria-hidden="true" />
                      Add {BUCKET_LABEL[b].toLowerCase()} stop
                    </button>
                  )
                })
              ) : (
                <p className="text-xs text-muted">
                  Sign in as a trip participant to add stops.
                </p>
              )}
            </div>
            {activeDay ? (
              <footer className="px-4 py-3 border-t border-border">
                <p className="text-[11px] text-subtle">
                  Day {activeDayOrder + 1}: {activeDayStops.length} stop
                  {activeDayStops.length === 1 ? '' : 's'} on the map.
                </p>
              </footer>
            ) : null}
          </div>
        )}
      </aside>
    </div>
  )
}

function StopRow({
  stop,
  canEdit,
  onChange,
  onRemove,
}: {
  stop: TripStop
  canEdit: boolean
  onChange: (patch: Partial<TripStop>) => void
  onRemove: () => void
}) {
  const Icon = CATEGORY_ICONS[stop.category ?? 'sight']
  return (
    <li className="border border-border rounded-sm bg-surface p-3 space-y-2">
      <div className="flex items-start gap-2">
        <Icon size={14} className="text-primary mt-2 flex-shrink-0" aria-hidden="true" />
        <div className="flex-1 grid grid-cols-1 sm:grid-cols-[1fr_120px_120px] gap-2">
          <input
            type="text"
            defaultValue={stop.name}
            onBlur={(e) =>
              e.target.value.trim() && e.target.value !== stop.name
                ? onChange({ name: e.target.value.trim() })
                : undefined
            }
            disabled={!canEdit}
            className="form-input"
            aria-label="Stop name"
          />
          <input
            type="time"
            defaultValue={stop.planned_time ? stop.planned_time.slice(0, 5) : ''}
            onChange={(e) =>
              onChange({ planned_time: e.target.value ? `${e.target.value}:00` : null })
            }
            disabled={!canEdit}
            className="form-input"
            aria-label="Planned time"
          />
          <select
            defaultValue={stop.category ?? 'sight'}
            onChange={(e) =>
              onChange({ category: e.target.value as TripStop['category'] })
            }
            disabled={!canEdit}
            className="form-input form-select"
            aria-label="Category"
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        {canEdit ? (
          <button
            type="button"
            onClick={onRemove}
            aria-label={`Remove ${stop.name}`}
            className="text-muted hover:text-danger mt-1.5"
          >
            <X size={14} aria-hidden="true" />
          </button>
        ) : null}
      </div>
      {stop.address ? (
        <p className="text-[11px] text-muted pl-6">{stop.address}</p>
      ) : null}
      {canEdit ? (
        <details className="pl-6">
          <summary className="text-[11px] text-muted cursor-pointer hover:text-ink">
            Notes for this stop
          </summary>
          <textarea
            defaultValue={stop.notes ?? ''}
            onBlur={(e) =>
              e.target.value !== (stop.notes ?? '')
                ? onChange({ notes: e.target.value })
                : undefined
            }
            rows={2}
            maxLength={500}
            placeholder="Reservation number, what to order, who to ask for…"
            className="form-input mt-1 text-xs"
            aria-label="Stop notes"
          />
        </details>
      ) : stop.notes ? (
        <p className="text-xs text-muted pl-6 italic">{stop.notes}</p>
      ) : null}
    </li>
  )
}
