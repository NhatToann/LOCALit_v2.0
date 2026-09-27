'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/utils/supabase/auth'
import type { Trip, TripDay, TripStop, Profile } from '@/lib/types'
import { Avatar } from '@/components/ui/Avatar'
import { MapPin, Plus, X, Clock, Trash2, Search } from 'lucide-react'
import { POPULAR_DA_NANG_STOPS, CATEGORY_ICONS, type PopularStop } from '@/lib/popular-stops'

interface Props {
  trip: Trip
  canEdit: boolean
  me: Profile
  onLogActivity: (verb: string, payload?: Record<string, unknown>) => void
}

export default function DaysTab({ trip, canEdit, me, onLogActivity }: Props) {
  const [days, setDays] = useState<TripDay[]>([])
  const [stops, setStops] = useState<TripStop[]>([])
  const [loading, setLoading] = useState(true)
  const [showAddTo, setShowAddTo] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [pickStop, setPickStop] = useState<PopularStop | null>(null)

  useEffect(() => {
    load()
  }, [trip.id])

  // Realtime: stops change → refetch
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
    setDays((d as TripDay[]) || [])
    setStops((s as TripStop[]) || [])
    setLoading(false)
  }

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
  }

  async function renameDay(day: TripDay, title: string) {
    if (!canEdit) return
    const supabase = createClient()
    await supabase.from('trip_days').update({ title }).eq('id', day.id)
    onLogActivity('renamed_day', { day_id: day.id, title })
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

  async function addStop(dayId: string, stop: PopularStop, time?: string) {
    if (!canEdit) return
    const supabase = createClient()
    const dayStops = stops.filter((s) => s.day_id === dayId)
    await supabase.from('trip_stops').insert({
      trip_id: trip.id,
      day_id: dayId,
      stop_order: dayStops.length,
      name: stop.name,
      address: stop.address,
      latitude: stop.lat,
      longitude: stop.lng,
      category: stop.category,
      planned_time: time ?? null,
    })
    onLogActivity('added_stop', { day_id: dayId, name: stop.name })
    setShowAddTo(null)
    setPickStop(null)
    load()
  }

  async function removeStop(stopId: string) {
    if (!canEdit) return
    const supabase = createClient()
    await supabase.from('trip_stops').delete().eq('id', stopId)
    load()
  }

  const filteredStops = POPULAR_DA_NANG_STOPS.filter((s) =>
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    s.address.toLowerCase().includes(search.toLowerCase()),
  )

  if (loading) {
    return <div className="loading-spinner mx-auto my-8" />
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_400px] gap-4">
      {/* Day list */}
      <div className="space-y-3">
        {days.length === 0 ? (
          <div className="border border-dashed border-border rounded-sm p-8 text-center bg-paper">
            <p className="text-sm text-muted mb-3">No days yet — break your trip into days to organize stops.</p>
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
            {days.map((day, idx) => {
              const dayStops = stops.filter((s) => s.day_id === day.id)
              return (
                <article
                  key={day.id}
                  className="border border-border rounded-sm bg-paper overflow-hidden"
                  aria-label={day.title ?? `Day ${idx + 1}`}
                >
                  <header className="flex items-center justify-between gap-2 px-4 py-3 border-b border-border bg-surface">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <span className="inline-flex items-center justify-center w-7 h-7 rounded-sm bg-primary text-paper text-xs font-semibold flex-shrink-0">
                        {idx + 1}
                      </span>
                      {canEdit ? (
                        <input
                          defaultValue={day.title ?? ''}
                          onBlur={(e) => {
                            if (e.target.value.trim() && e.target.value !== day.title) {
                              renameDay(day, e.target.value.trim())
                            }
                          }}
                          className="text-sm font-semibold bg-transparent border-b border-transparent hover:border-border focus:border-primary focus:outline-none flex-1 min-w-0"
                          aria-label="Day title"
                        />
                      ) : (
                        <h3 className="text-sm font-semibold truncate">{day.title}</h3>
                      )}
                    </div>
                    {canEdit ? (
                      <button
                        type="button"
                        onClick={() => deleteDay(day.id)}
                        aria-label="Delete day"
                        className="text-muted hover:text-danger"
                      >
                        <Trash2 size={14} aria-hidden="true" />
                      </button>
                    ) : null}
                  </header>

                  {/* Stops timeline */}
                  <ol className="px-4 py-3 space-y-1">
                    {dayStops.length === 0 ? (
                      <li className="text-xs text-muted italic py-3">No stops yet</li>
                    ) : (
                      dayStops.map((s, i) => {
                        const Icon = CATEGORY_ICONS[s.category ?? 'sight']
                        return (
                          <li
                            key={s.id}
                            className="flex items-center gap-3 px-3 py-2 border border-border rounded-sm bg-surface"
                          >
                            <Icon size={14} className="text-primary flex-shrink-0" aria-hidden="true" />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm text-ink truncate">{s.name}</p>
                              {s.address ? (
                                <p className="text-[11px] text-muted truncate">{s.address}</p>
                              ) : null}
                            </div>
                            {s.planned_time ? (
                              <span className="text-[11px] text-muted whitespace-nowrap">
                                {s.planned_time.slice(0, 5)}
                              </span>
                            ) : null}
                            {canEdit ? (
                              <button
                                type="button"
                                onClick={() => removeStop(s.id)}
                                aria-label={`Remove ${s.name}`}
                                className="text-muted hover:text-danger"
                              >
                                <X size={12} aria-hidden="true" />
                              </button>
                            ) : null}
                          </li>
                        )
                      })
                    )}
                  </ol>

                  {canEdit ? (
                    <div className="border-t border-border px-4 py-2 bg-paper">
                      <button
                        type="button"
                        onClick={() => setShowAddTo(day.id)}
                        className="inline-flex items-center gap-1 h-7 px-2.5 text-xs font-medium rounded-sm bg-transparent text-primary border border-primary hover:bg-primary hover:text-paper"
                      >
                        <Plus size={11} aria-hidden="true" /> Add stop
                      </button>
                    </div>
                  ) : null}
                </article>
              )
            })}
            {canEdit ? (
              <button
                type="button"
                onClick={addDay}
                className="w-full inline-flex items-center justify-center gap-1 h-10 px-4 text-sm rounded-sm border border-dashed border-border-strong text-muted hover:text-ink hover:border-primary"
              >
                <Plus size={13} aria-hidden="true" /> Add another day
              </button>
            ) : null}
          </>
        )}
      </div>

      {/* Stop picker sidebar */}
      <aside
        className="border border-border rounded-sm bg-surface overflow-hidden lg:sticky lg:top-20 self-start"
        aria-label="Add a stop"
      >
        <header className="px-4 py-3 border-b border-border">
          <p className="text-eyebrow text-muted mb-1">Da Nang favorites</p>
          <p className="text-xs text-subtle">
            Click a stop, then choose a day. You can also reorder later.
          </p>
        </header>
        {showAddTo ? (
          <div className="px-4 py-2 border-b border-border bg-info-bg text-info text-xs flex items-center gap-2">
            <span>Pick a stop to add to {days.find((d) => d.id === showAddTo)?.title}</span>
            <button
              type="button"
              onClick={() => setShowAddTo(null)}
              className="ml-auto text-info hover:underline"
              aria-label="Cancel"
            >
              <X size={12} aria-hidden="true" />
            </button>
          </div>
        ) : null}
        <div className="px-3 py-2 border-b border-border">
          <div className="relative">
            <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted" aria-hidden="true" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search 50+ Da Nang places…"
              className="w-full pl-8 pr-2 py-1.5 text-sm border border-border rounded-sm bg-paper focus:outline-none focus:border-primary"
            />
          </div>
        </div>
        <ul className="max-h-[60vh] overflow-y-auto">
          {filteredStops.length === 0 ? (
            <li className="px-4 py-6 text-xs text-muted text-center">No matches.</li>
          ) : (
            filteredStops.map((s) => {
              const Icon = CATEGORY_ICONS[s.category]
              const disabled = !showAddTo || !canEdit
              return (
                <li key={s.id}>
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => showAddTo && addStop(showAddTo, s)}
                    className={`w-full flex items-start gap-2 px-3 py-2.5 text-left border-b border-border last:border-b-0 ${
                      disabled
                        ? 'opacity-60 cursor-not-allowed'
                        : 'hover:bg-paper'
                    }`}
                  >
                    <Icon size={14} className="text-primary mt-0.5 flex-shrink-0" aria-hidden="true" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-ink truncate">{s.name}</p>
                      <p className="text-[11px] text-muted truncate">{s.address}</p>
                    </div>
                  </button>
                </li>
              )
            })
          )}
        </ul>
      </aside>
    </div>
  )
}
