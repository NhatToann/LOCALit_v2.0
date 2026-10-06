'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { Cloud, Car, DollarSign, MapPin, FileText, Save } from 'lucide-react'
import { createClient } from '@/utils/supabase/auth'
import type { Trip, Profile } from '@/lib/types'

interface Props {
  trip: Trip
  canEdit: boolean
  me: Profile
  weather: { tempC: number | null; windKph: number | null; summary: string | null }
  onLogActivity: (verb: string, payload?: Record<string, unknown>) => void
}

const TRANSPORTS: Array<{ id: NonNullable<Trip['transport']>; label: string }> = [
  { id: 'motorbike', label: 'Motorbike' },
  { id: 'car', label: 'Car' },
  { id: 'walking', label: 'Walking' },
  { id: 'mixed', label: 'Mixed' },
]

export default function NotesTab({ trip, canEdit, me, weather, onLogActivity }: Props) {
  const [transport, setTransport] = useState<Trip['transport']>(trip.transport ?? null)
  const [costEstimate, setCostEstimate] = useState<string>(
    trip.budget_estimate !== null && trip.budget_estimate !== undefined
      ? String(trip.budget_estimate)
      : '',
  )
  const [meetupPoint, setMeetupPoint] = useState(trip.meetup_point ?? '')
  const [notes, setNotes] = useState(trip.itinerary_notes ?? '')
  const [savingField, setSavingField] = useState<string | null>(null)
  const lastSaved = useRef<{ notes: string; transport: string | null; cost: string; meetup: string }>({
    notes: trip.itinerary_notes ?? '',
    transport: trip.transport ?? null,
    cost: costEstimate,
    meetup: trip.meetup_point ?? '',
  })

  const persist = useCallback(
    async (patch: Partial<Pick<Trip, 'transport' | 'meetup_point' | 'itinerary_notes' | 'budget_estimate'>>) => {
      setSavingField('saving')
      const supabase = createClient()
      await supabase
        .from('trips')
        .update({ ...patch, itinerary_updated_at: new Date().toISOString(), itinerary_updated_by: me.id })
        .eq('id', trip.id)
      setSavingField(null)
    },
    [trip.id, me.id],
  )

  // Auto-save notes 1.2s after last keystroke
  useEffect(() => {
    if (!canEdit) return
    if (notes === lastSaved.current.notes) return
    const t = setTimeout(() => {
      void persist({ itinerary_notes: notes })
      lastSaved.current.notes = notes
      onLogActivity('edited_notes', { length: notes.length })
    }, 1200)
    return () => clearTimeout(t)
  }, [notes, canEdit, persist, onLogActivity])

  function onTransportChange(v: NonNullable<Trip['transport']>) {
    setTransport(v)
    lastSaved.current.transport = v
    void persist({ transport: v })
  }

  function onCostBlur() {
    const parsed = costEstimate.trim() === '' ? null : Number(costEstimate)
    if (parsed !== null && (Number.isNaN(parsed) || parsed < 0)) return
    lastSaved.current.cost = costEstimate
    void persist({ budget_estimate: parsed })
  }

  function onMeetupBlur() {
    if (meetupPoint === lastSaved.current.meetup) return
    lastSaved.current.meetup = meetupPoint
    void persist({ meetup_point: meetupPoint })
  }

  return (
    <section className="border border-border rounded-sm bg-surface p-4 space-y-4" aria-label="Trip notes">
      <header className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-ink">Notes</h2>
        <span className="text-[10px] text-subtle inline-flex items-center gap-1">
          {savingField ? (
            <>
              <Save size={10} aria-hidden="true" />
              Saving…
            </>
          ) : (
            <>Auto-save · Last edited by {me.full_name ?? 'you'}</>
          )}
        </span>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label htmlFor="notes-weather" className="text-[11px] uppercase tracking-wide text-muted inline-flex items-center gap-1">
            <Cloud size={11} aria-hidden="true" /> Weather
          </label>
          <input
            id="notes-weather"
            type="text"
            value={
              weather.tempC !== null
                ? `${Math.round(weather.tempC)}°C · ${weather.summary ?? ''}${weather.windKph ? ` · ${Math.round(weather.windKph)} km/h wind` : ''}`
                : ''
            }
            readOnly
            placeholder="Set a trip start date to auto-fill"
            className="mt-1 w-full h-9 px-3 text-sm bg-paper border border-border rounded-sm text-ink placeholder:text-subtle"
          />
        </div>

        <div>
          <label htmlFor="notes-transport" className="text-[11px] uppercase tracking-wide text-muted inline-flex items-center gap-1">
            <Car size={11} aria-hidden="true" /> Transport
          </label>
          <select
            id="notes-transport"
            value={transport ?? ''}
            disabled={!canEdit}
            onChange={(e) => onTransportChange(e.target.value as NonNullable<Trip['transport']>)}
            className="mt-1 w-full h-9 px-2 text-sm bg-paper border border-border rounded-sm text-ink disabled:opacity-50"
          >
            <option value="">Select…</option>
            {TRANSPORTS.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="notes-cost" className="text-[11px] uppercase tracking-wide text-muted inline-flex items-center gap-1">
            <DollarSign size={11} aria-hidden="true" /> Cost estimate (USD)
          </label>
          <input
            id="notes-cost"
            type="number"
            inputMode="decimal"
            min="0"
            value={costEstimate}
            disabled={!canEdit}
            onChange={(e) => setCostEstimate(e.target.value)}
            onBlur={onCostBlur}
            placeholder="0"
            className="mt-1 w-full h-9 px-3 text-sm bg-paper border border-border rounded-sm text-ink placeholder:text-subtle disabled:opacity-50"
          />
        </div>

        <div>
          <label htmlFor="notes-meetup" className="text-[11px] uppercase tracking-wide text-muted inline-flex items-center gap-1">
            <MapPin size={11} aria-hidden="true" /> Meetup point
          </label>
          <input
            id="notes-meetup"
            type="text"
            value={meetupPoint}
            disabled={!canEdit}
            onChange={(e) => setMeetupPoint(e.target.value)}
            onBlur={onMeetupBlur}
            placeholder="e.g. Han Market front gate, 8:30 AM"
            className="mt-1 w-full h-9 px-3 text-sm bg-paper border border-border rounded-sm text-ink placeholder:text-subtle disabled:opacity-50"
          />
        </div>
      </div>

      <div>
        <label htmlFor="notes-body" className="text-[11px] uppercase tracking-wide text-muted inline-flex items-center gap-1">
          <FileText size={11} aria-hidden="true" /> Notes
        </label>
        <textarea
          id="notes-body"
          value={notes}
          disabled={!canEdit}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Anything the team should know — restaurant preferences, dietary needs, hidden costs…"
          rows={6}
          className="mt-1 w-full px-3 py-2 text-sm bg-paper border border-border rounded-sm text-ink placeholder:text-subtle disabled:opacity-50 resize-y"
        />
      </div>
    </section>
  )
}
