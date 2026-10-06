'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  Plus,
  X,
  Check,
  MapPin,
  Calendar,
  FileText,
  Compass,
  Tag,
  Loader2,
} from 'lucide-react'
import { createClient } from '@/utils/supabase/auth'

interface Stop {
  name: string
  address: string
  notes: string
}

const today = () => new Date().toISOString().slice(0, 10)

export default function CreateTripPage() {
  const router = useRouter()
  const [form, setForm] = useState({
    title: '',
    startDate: '',
    endDate: '',
    notes: '',
  })
  const [stops, setStops] = useState<Stop[]>([{ name: '', address: '', notes: '' }])
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  function addStop() {
    setStops([...stops, { name: '', address: '', notes: '' }])
  }

  function removeStop(idx: number) {
    setStops(stops.filter((_, i) => i !== idx))
  }

  function updateStop(idx: number, field: keyof Stop, value: string) {
    setStops(stops.map((s, i) => (i === idx ? { ...s, [field]: value } : s)))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!form.title.trim()) {
      setError('Please enter a trip name.')
      return
    }
    if (form.endDate && form.startDate && form.endDate < form.startDate) {
      setError('End date must be on or after start date.')
      return
    }
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setError('You must be signed in.')
      return
    }
    setSubmitting(true)
    const { data: trip, error: tripError } = await supabase
      .from('trips')
      .insert({
        tourist_id: user.id,
        title: form.title,
        destination: 'Da Nang',
        start_date: form.startDate || null,
        end_date: form.endDate || null,
        notes: form.notes || null,
        status: 'planning',
      })
      .select()
      .single()
    if (tripError || !trip) {
      setError('Could not create trip: ' + (tripError?.message || ''))
      setSubmitting(false)
      return
    }
    const validStops = stops.filter((s) => s.name.trim())
    if (validStops.length > 0) {
      await supabase.from('trip_stops').insert(
        validStops.map((s, i) => ({
          trip_id: trip.id,
          stop_order: i + 1,
          name: s.name,
          address: s.address || null,
          notes: s.notes || null,
        })),
      )
    }
    router.push(`/trips/${trip.id}`)
  }

  const dayCount =
    form.startDate && form.endDate
      ? Math.max(
          1,
          Math.round(
            (new Date(form.endDate).getTime() - new Date(form.startDate).getTime()) /
              (1000 * 60 * 60 * 24),
          ) + 1,
        )
      : null

  return (
    <div className="container-page py-6 lg:py-8 space-y-4">
      {/* Hero — matches ItineraryHero pattern: bg photo + gradient overlay + bilingual eyebrow */}
      <section
        className="relative overflow-hidden border border-border rounded-sm bg-surface"
        aria-label="New trip header"
      >
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{
            backgroundImage:
              "url('https://images.unsplash.com/photo-1602002418082-a4443e081dd1?w=1600&q=70&auto=format&fit=crop')",
            opacity: 0.18,
          }}
          aria-hidden="true"
        />
        <div
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(90deg, color-mix(in srgb, var(--color-paper) 95%, transparent) 0%, color-mix(in srgb, var(--color-paper) 70%, transparent) 100%)',
          }}
          aria-hidden="true"
        />
        <div className="relative p-6 lg:p-8">
          <p className="text-eyebrow text-primary mb-2">
            New itinerary
            <span
              className="ml-2 italic text-muted"
              style={{ letterSpacing: '0.02em' }}
              aria-hidden="true"
            >
              lịch trình mới
            </span>
          </p>
          <h1 className="text-page-title mb-2">Plan a new trip</h1>
          <p className="text-sm text-muted max-w-xl">
            Tell LOCALit your dates and stops. We pair each trip with a verified Da Nang buddy who
            matches your interests.
          </p>
          <div className="flex flex-wrap items-center gap-2 mt-3">
            <span className="badge badge-primary text-xs">Da Nang only</span>
            {dayCount !== null ? (
              <span className="badge badge-success text-xs" style={{ fontVariantNumeric: 'tabular-nums' }}>
                {dayCount} day{dayCount === 1 ? '' : 's'}
              </span>
            ) : (
              <span className="text-xs text-muted">Pick dates to see day count</span>
            )}
          </div>
        </div>
      </section>

      <form onSubmit={handleSubmit} className="max-w-2xl space-y-4" noValidate>
        {/* Trip details */}
        <fieldset className="border border-border rounded-sm bg-surface p-5">
          <legend className="px-2 text-[11px] uppercase tracking-wide text-muted">
            <Compass size={11} className="inline-block mr-1 align-middle" aria-hidden="true" />
            Trip details
          </legend>

          <div className="form-group">
            <label htmlFor="title" className="form-label">
              Trip name <span className="text-danger" aria-hidden="true">*</span>
            </label>
            <input
              id="title"
              type="text"
              required
              maxLength={200}
              placeholder="e.g. Da Nang Beach Adventure"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              className="form-input"
            />
          </div>

          <div className="form-group">
            <span className="form-label">Destination</span>
            <div className="flex items-center gap-2 h-10 px-3 bg-paper border border-border rounded-sm">
              <MapPin size={13} className="text-primary" aria-hidden="true" />
              <span className="text-sm text-ink">Da Nang, Vietnam</span>
              <span className="ml-auto text-[10px] uppercase tracking-wide text-muted">
                fixed at launch
              </span>
            </div>
            <p className="form-hint">LOCALit currently focuses on Da Nang. More cities later.</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="form-group">
              <label htmlFor="startDate" className="form-label inline-flex items-center gap-1">
                <Calendar size={11} aria-hidden="true" /> Start date
              </label>
              <input
                id="startDate"
                type="date"
                min={today()}
                value={form.startDate}
                onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                className="form-input"
              />
            </div>
            <div className="form-group">
              <label htmlFor="endDate" className="form-label inline-flex items-center gap-1">
                <Calendar size={11} aria-hidden="true" /> End date
              </label>
              <input
                id="endDate"
                type="date"
                min={form.startDate || today()}
                value={form.endDate}
                onChange={(e) => setForm({ ...form, endDate: e.target.value })}
                className="form-input"
              />
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="notes" className="form-label inline-flex items-center gap-1">
              <FileText size={11} aria-hidden="true" /> Notes for your buddy
            </label>
            <textarea
              id="notes"
              rows={3}
              maxLength={1000}
              placeholder="Special requests, things you want to do, dietary needs…"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              className="form-input form-textarea"
            />
            <p className="form-hint">
              <span
                style={{
                  fontVariantNumeric: 'tabular-nums',
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                }}
              >
                {form.notes.length}
              </span>
              /1000 characters
            </p>
          </div>
        </fieldset>

        {/* Stops */}
        <fieldset className="border border-border rounded-sm bg-surface p-5">
          <legend className="px-2 text-[11px] uppercase tracking-wide text-muted">
            <MapPin size={11} className="inline-block mr-1 align-middle" aria-hidden="true" />
            Stops
            {stops.length > 0 ? (
              <span
                className="ml-2 text-muted normal-case tracking-normal"
                style={{ fontVariantNumeric: 'tabular-nums' }}
              >
                {stops.filter((s) => s.name.trim()).length}/{stops.length} named
              </span>
            ) : null}
          </legend>

          {stops.map((stop, idx) => (
            <article
              key={idx}
              className="border-t border-border first:border-t-0 py-4 first:pt-0 last:pb-0"
            >
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-medium text-ink inline-flex items-center gap-2">
                  <span
                    className="inline-flex items-center justify-center w-6 h-6 rounded-sm bg-primary text-paper text-[11px] font-semibold"
                    style={{ fontVariantNumeric: 'tabular-nums' }}
                    aria-hidden="true"
                  >
                    {idx + 1}
                  </span>
                  <MapPin size={12} className="text-muted" aria-hidden="true" />
                  Stop {idx + 1}
                </p>
                {stops.length > 1 ? (
                  <button
                    type="button"
                    onClick={() => removeStop(idx)}
                    aria-label={`Remove stop ${idx + 1}`}
                    className="inline-flex items-center gap-1 text-xs text-muted hover:text-danger"
                  >
                    <X size={12} aria-hidden="true" />
                    Remove
                  </button>
                ) : null}
              </div>
              <div className="form-group">
                <label htmlFor={`stop-name-${idx}`} className="form-label sr-only">
                  Place name
                </label>
                <input
                  id={`stop-name-${idx}`}
                  type="text"
                  placeholder="Place name (e.g. Ba Na Hills)"
                  value={stop.name}
                  onChange={(e) => updateStop(idx, 'name', e.target.value)}
                  maxLength={200}
                  className="form-input"
                />
              </div>
              <div className="form-group">
                <label htmlFor={`stop-address-${idx}`} className="form-label sr-only">
                  Address
                </label>
                <input
                  id={`stop-address-${idx}`}
                  type="text"
                  placeholder="Address (optional)"
                  value={stop.address}
                  onChange={(e) => updateStop(idx, 'address', e.target.value)}
                  maxLength={300}
                  className="form-input"
                />
              </div>
              <div className="form-group">
                <label htmlFor={`stop-notes-${idx}`} className="form-label sr-only">
                  Notes
                </label>
                <textarea
                  id={`stop-notes-${idx}`}
                  rows={2}
                  maxLength={500}
                  placeholder="Notes for this stop (optional)"
                  value={stop.notes}
                  onChange={(e) => updateStop(idx, 'notes', e.target.value)}
                  className="form-input form-textarea"
                />
              </div>
            </article>
          ))}

          <button
            type="button"
            onClick={addStop}
            className="mt-3 inline-flex items-center gap-1 h-9 px-3 text-sm font-medium rounded-sm bg-transparent text-ink border border-border-strong hover:bg-paper"
          >
            <Plus size={14} aria-hidden="true" />
            Add stop
          </button>
        </fieldset>

        {error ? (
          <div className="alert alert-error" role="alert">
            <X size={14} aria-hidden="true" />
            <span>{error}</span>
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={submitting}
            className="inline-flex items-center gap-2 h-11 px-5 text-sm font-medium rounded-sm bg-primary text-paper border border-primary hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? (
              <>
                <Loader2 size={16} className="animate-spin" aria-hidden="true" />
                Creating…
              </>
            ) : (
              <>
                <Check size={16} aria-hidden="true" />
                Create trip
              </>
            )}
          </button>
          <Link
            href="/trips"
            className="inline-flex items-center h-11 px-5 text-sm font-medium rounded-sm bg-transparent text-ink border border-border-strong hover:bg-paper"
          >
            Cancel
          </Link>
          <span className="text-[10px] text-subtle inline-flex items-center gap-1">
            <Tag size={10} aria-hidden="true" />
            Buddy will be matched after you create
          </span>
        </div>
      </form>
    </div>
  )
}
