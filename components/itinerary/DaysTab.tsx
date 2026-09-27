'use client'

import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/utils/supabase/auth'
import type { Trip, TripDay, TripStop, Profile } from '@/lib/types'
import dynamic from 'next/dynamic'
import {
  Plus,
  X,
  Trash2,
  MapPin,
  Edit3,
} from 'lucide-react'
import { CATEGORY_ICONS } from '@/lib/popular-stops'
import { TRANSPORT_LIST, TRANSPORT_LABEL, TRANSPORT_DEFAULT, isTransport, type Transport } from '@/lib/transport'

const MapFullscreen = dynamic(
  () => import('@/components/itinerary/MapFullscreen'),
  { ssr: false },
)

interface Props {
  trip: Trip
  canEdit: boolean
  me: Profile
  onLogActivity: (verb: string, payload?: Record<string, unknown>) => void
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
  const searchParams = useSearchParams()
  const targetStopId = searchParams?.get('stop') ?? null
  const autoPick = searchParams?.get('pick') === '1'

  const [days, setDays] = useState<TripDay[]>([])
  const [stops, setStops] = useState<TripStop[]>([])
  const [loading, setLoading] = useState(true)
  const [activeDayId, setActiveDayId] = useState<string | null>(null)
  const [picker, setPicker] = useState<{
    stopId: string | null
    dayId: string
  } | null>(null)
  const [highlightStopId, setHighlightStopId] = useState<string | null>(null)

  useEffect(() => {
    load()
    loadBuddyTransport()
  }, [trip.id])

  // After data loads, honour ?stop=...&pick=1 by jumping to the right day
  // and (optionally) auto-opening the map picker for it. The dashboard
  // uses these query params to deep-link into a specific stop.
  useEffect(() => {
    if (loading || !targetStopId) return
    const stop = stops.find((s) => s.id === targetStopId)
    if (!stop) return
    if (stop.day_id) setActiveDayId(stop.day_id)
    if (autoPick && stop.day_id) {
      setPicker({ stopId: stop.id, dayId: stop.day_id })
    }
    setHighlightStopId(stop.id)
    const t = setTimeout(() => setHighlightStopId(null), 4000)
    return () => clearTimeout(t)
  }, [loading, targetStopId, autoPick, stops])

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

  const [buddyTransport, setBuddyTransport] = useState<Transport | null>(null)

  async function loadBuddyTransport() {
    const supabase = createClient()
    const { data: b } = await supabase
      .from('buddies')
      .select('transport')
      .eq('id', me.id)
      .maybeSingle()
    if (b?.transport && isTransport(b.transport)) {
      setBuddyTransport(b.transport)
    }
  }

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

  async function addStop(dayId: string) {
    if (!canEdit) return
    const supabase = createClient()
    const orderInDay = stops.filter((s) => s.day_id === dayId).length
    const { data, error } = await supabase
      .from('trip_stops')
      .insert({
        trip_id: trip.id,
        day_id: dayId,
        stop_order: orderInDay,
        name: 'New stop',
        category: 'sight',
        transport: buddyTransport ?? TRANSPORT_DEFAULT,
      })
      .select()
      .single()
    if (error) {
      alert('Could not add stop: ' + error.message)
      return
    }
    onLogActivity('added_stop', { stop_id: data?.id })
    await load()
    // Open the picker for the new stop right away
    if (data) setPicker({ stopId: data.id, dayId })
  }

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

          {/* Stops list — free time, no bucket pills */}
          <section
            aria-label={`Stops for ${activeDay.title}`}
            className="border border-border rounded-sm bg-paper overflow-hidden"
          >
            <header className="flex items-center justify-between gap-2 px-4 py-2.5 border-b border-border bg-surface">
              <h4 className="text-sm font-semibold">Stops</h4>
              <span className="text-[11px] text-muted">
                {activeDayStops.length} stop{activeDayStops.length === 1 ? '' : 's'} · time is free
              </span>
            </header>
            <ul className="px-4 py-3 space-y-2">
              {activeDayStops.length === 0 ? (
                <li className="text-xs text-muted italic py-2">
                  No stops yet. Add one below.
                </li>
              ) : (
                activeDayStops.map((s) => (
                  <StopRow
                    key={s.id}
                    stop={s}
                    canEdit={canEdit}
                    highlighted={highlightStopId === s.id}
                    buddyDefault={buddyTransport}
                    onChange={(patch) => updateStop(s, patch)}
                    onRemove={() => removeStop(s.id)}
                    onPick={() => setPicker({ stopId: s.id, dayId: activeDay.id })}
                  />
                ))
              )}
            </ul>
            {canEdit ? (
              <footer className="border-t border-border px-4 py-2 bg-paper">
                <button
                  type="button"
                  onClick={() => addStop(activeDay.id)}
                  className="inline-flex items-center gap-1 h-7 px-2.5 text-xs font-medium rounded-sm bg-transparent text-primary border border-primary hover:bg-primary hover:text-paper"
                >
                  <Plus size={11} aria-hidden="true" /> Add stop
                </button>
              </footer>
            ) : null}
          </section>
        </>
      )}

      {/* Map picker modal */}
      {picker ? (
        <MapFullscreen
          initialLat={
            picker.stopId
              ? stops.find((s) => s.id === picker.stopId)?.latitude ?? undefined
              : undefined
          }
          initialLng={
            picker.stopId
              ? stops.find((s) => s.id === picker.stopId)?.longitude ?? undefined
              : undefined
          }
          onCancel={() => setPicker(null)}
          onPick={(loc) => {
            if (picker.stopId) {
              updateStop(
                stops.find((s) => s.id === picker.stopId!)!,
                {
                  latitude: loc.lat,
                  longitude: loc.lng,
                  address: loc.address,
                  name:
                    stops.find((s) => s.id === picker.stopId)?.name &&
                    stops.find((s) => s.id === picker.stopId)!.name !== 'New stop'
                      ? stops.find((s) => s.id === picker.stopId)!.name
                      : loc.address.split(',')[0]?.trim() || 'New stop',
                },
              )
            }
            setPicker(null)
          }}
        />
      ) : null}
    </div>
  )
}

function useHighlightedScroll(stopId: string, highlighted?: boolean) {
  const ref = useRef<HTMLLIElement | null>(null)
  useEffect(() => {
    if (!highlighted || !ref.current) return
    const t = setTimeout(() => {
      ref.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 80)
    return () => clearTimeout(t)
  }, [highlighted, stopId])
  return ref
}

function StopRow({
  stop,
  canEdit,
  highlighted,
  buddyDefault,
  onChange,
  onRemove,
  onPick,
}: {
  stop: TripStop
  canEdit: boolean
  highlighted?: boolean
  buddyDefault: Transport | null
  onChange: (patch: Partial<TripStop>) => void
  onRemove: () => void
  onPick: () => void
}) {
  const Icon = CATEGORY_ICONS[stop.category ?? 'sight']
  const hasLocation = stop.latitude !== null && stop.longitude !== null

  // The stop row holds local state for the editable text fields so that
  // updates from the map picker (which writes via `updateStop`) immediately
  // reflect in the visible input. The state re-seeds whenever the stop
  // changes identity (different id) or the upstream server value changes.
  const [nameDraft, setNameDraft] = useState(stop.name)
  const [notesDraft, setNotesDraft] = useState(stop.notes ?? '')
  useEffect(() => {
    setNameDraft(stop.name)
  }, [stop.id, stop.name])
  useEffect(() => {
    setNotesDraft(stop.notes ?? '')
  }, [stop.id, stop.notes])

  // Scroll into view when this stop is the target of a deep-link.
  // Defer to the next frame so layout (active day switch) is settled first.
  const rowRef = useHighlightedScroll(stop.id, highlighted)

  return (
    <li
      id={`stop-${stop.id}`}
      ref={rowRef}
      className={`border rounded-sm bg-surface p-3 space-y-2 transition-colors duration-500 ${
        highlighted ? 'border-primary ring-2 ring-primary/30' : 'border-border'
      }`}
    >
      <div className="flex items-start gap-2">
        <Icon size={14} className="text-primary mt-2 flex-shrink-0" aria-hidden="true" />
        <div className="flex-1 grid grid-cols-1 sm:grid-cols-[1fr_120px_120px_140px] gap-2">
          <input
            type="text"
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
            onBlur={() => {
              const v = nameDraft.trim()
              if (v && v !== stop.name) onChange({ name: v })
              else if (!v) setNameDraft(stop.name)
            }}
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
          <select
            value={stop.transport ?? ''}
            onChange={(e) =>
              onChange({ transport: e.target.value === '' ? null : (e.target.value as Transport) })
            }
            disabled={!canEdit}
            className="form-input form-select"
            aria-label="How you get there"
            title="How you get to this stop"
          >
            <option value="">Inherit ({buddyDefault ? TRANSPORT_LABEL[buddyDefault] : TRANSPORT_LABEL[TRANSPORT_DEFAULT]})</option>
            {TRANSPORT_LIST.map((t) => (
              <option key={t} value={t}>
                {TRANSPORT_LABEL[t]}
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

      {/* Location row */}
      <div className="pl-6 flex items-start gap-2">
        <MapPin
          size={12}
          className={hasLocation ? 'text-primary mt-0.5 flex-shrink-0' : 'text-subtle mt-0.5 flex-shrink-0'}
          aria-hidden="true"
        />
        <div className="flex-1 min-w-0">
          {hasLocation ? (
            <p className="text-[11px] text-muted line-clamp-1">{stop.address}</p>
          ) : (
            <p className="text-[11px] text-subtle italic">No location picked yet</p>
          )}
        </div>
        {canEdit ? (
          <button
            type="button"
            onClick={onPick}
            className="inline-flex items-center gap-1 h-6 px-2 text-[11px] rounded-sm bg-transparent text-primary border border-primary hover:bg-primary hover:text-paper"
          >
            <Edit3 size={10} aria-hidden="true" />
            {hasLocation ? 'Change' : 'Pick location'}
          </button>
        ) : null}
      </div>

      {canEdit ? (
        <details className="pl-6">
          <summary className="text-[11px] text-muted cursor-pointer hover:text-ink">
            Notes for this stop
          </summary>
          <textarea
            value={notesDraft}
            onChange={(e) => setNotesDraft(e.target.value)}
            onBlur={() => {
              if (notesDraft !== (stop.notes ?? '')) onChange({ notes: notesDraft })
            }}
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
