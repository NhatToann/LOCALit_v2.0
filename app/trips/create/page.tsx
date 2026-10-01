'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Plus, X, Check, MapPin } from 'lucide-react'
import { createClient } from '@/utils/supabase/auth'

interface Stop {
  name: string
  address: string
  notes: string
}

export default function CreateTripPage() {
  const router = useRouter()
  const [form, setForm] = useState({
    title: '',
    destination: 'Da Nang',
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
        destination: form.destination,
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

  return (
    <div className="container-page py-8">
      <header className="mb-6">
        <p className="text-eyebrow text-primary mb-2">New itinerary</p>
        <h1 className="text-page-title">Plan a new trip</h1>
        <p className="text-sm text-muted mt-1 max-w-prose">
          Tell LOCALit your dates and stops. We pair each trip with a verified local buddy who
          matches your interests.
        </p>
      </header>

      <form onSubmit={handleSubmit} className="max-w-2xl" noValidate>
        <fieldset className="border border-border rounded-sm bg-surface p-6 mb-6">
          <legend className="px-2 text-sm font-semibold text-ink">Trip details</legend>

          <div className="form-group">
            <label htmlFor="title" className="form-label">
              Trip name <span className="text-danger">*</span>
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
            <label htmlFor="destination" className="form-label">
              Destination
            </label>
            <input
              id="destination"
              type="text"
              value="Da Nang"
              readOnly
              className="form-input bg-paper"
            />
            <p className="form-hint">LOCALit currently focuses on Da Nang.</p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="form-group">
              <label htmlFor="startDate" className="form-label">
                Start date
              </label>
              <input
                id="startDate"
                type="date"
                value={form.startDate}
                onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                className="form-input"
              />
            </div>
            <div className="form-group">
              <label htmlFor="endDate" className="form-label">
                End date
              </label>
              <input
                id="endDate"
                type="date"
                value={form.endDate}
                min={form.startDate}
                onChange={(e) => setForm({ ...form, endDate: e.target.value })}
                className="form-input"
              />
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="notes" className="form-label">
              Notes for your buddy
            </label>
            <textarea
              id="notes"
              rows={3}
              maxLength={1000}
              placeholder="Special requests or things you want to do..."
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              className="form-input form-textarea"
            />
            <p className="form-hint">{form.notes.length}/1000 characters</p>
          </div>
        </fieldset>

        <fieldset className="border border-border rounded-sm bg-surface p-6 mb-6">
          <legend className="px-2 text-sm font-semibold text-ink">Stops</legend>

          {stops.map((stop, idx) => (
            <div
              key={idx}
              className="border-t border-border first:border-t-0 py-4 first:pt-0 last:pb-0"
            >
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-medium text-ink">
                  <MapPin size={14} className="inline-block mr-1 align-middle" aria-hidden="true" />
                  Stop #{idx + 1}
                </p>
                {stops.length > 1 ? (
                  <button
                    type="button"
                    onClick={() => removeStop(idx)}
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
            </div>
          ))}

          <button
            type="button"
            onClick={addStop}
            className="mt-4 inline-flex items-center gap-1 h-9 px-3 text-sm font-medium rounded-sm bg-transparent text-ink border border-border-strong hover:bg-paper"
          >
            <Plus size={14} aria-hidden="true" />
            Add stop
          </button>
        </fieldset>

        {error ? (
          <div className="alert alert-error mb-4" role="alert">
            <span>{error}</span>
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={submitting}
            className="inline-flex items-center gap-2 h-11 px-5 text-sm font-medium rounded-sm bg-primary text-paper border border-primary hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Check size={16} aria-hidden="true" />
            {submitting ? 'Creating…' : 'Create trip'}
          </button>
          <Link
            href="/trips"
            className="inline-flex items-center h-11 px-5 text-sm font-medium rounded-sm bg-transparent text-ink border border-border-strong hover:bg-paper"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  )
}
