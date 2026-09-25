'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
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
    setStops(stops.map((s, i) => i === idx ? { ...s, [field]: value } : s))
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
    const { data: trip, error: tripError } = await supabase.from('trips').insert({
      tourist_id: user.id,
      title: form.title,
      destination: form.destination,
      start_date: form.startDate || null,
      end_date: form.endDate || null,
      notes: form.notes || null,
      status: 'planning',
    }).select().single()

    if (tripError || !trip) {
      setError('Could not create trip: ' + (tripError?.message || ''))
      setSubmitting(false)
      return
    }

    const validStops = stops.filter(s => s.name.trim())
    if (validStops.length > 0) {
      await supabase.from('trip_stops').insert(
        validStops.map((s, i) => ({
          trip_id: trip.id,
          stop_order: i + 1,
          name: s.name,
          address: s.address || null,
          notes: s.notes || null,
        }))
      )
    }

    router.push(`/tourist/trips/${trip.id}`)
  }

  return (
    <div className="container py-xl">
      <h1 className="text-3xl font-bold mb-lg">Plan a new trip</h1>

      <form onSubmit={handleSubmit} className="card" style={{ maxWidth: 720, margin: '0 auto' }}>
        <div className="card-body">
          <div className="form-group">
            <label className="form-label">Trip name *</label>
            <input
              className="form-input"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              required
              maxLength={200}
              placeholder="e.g. Da Nang Beach Adventure"
            />
          </div>

          <div className="form-group">
            <label className="form-label">Destination</label>
            <input
              className="form-input"
              value="Da Nang"
              readOnly
            />
            <p className="form-hint">LOCALit currently focuses on Da Nang.</p>
          </div>

          <div className="grid grid-2">
            <div className="form-group">
              <label className="form-label">Start date</label>
              <input
                type="date"
                className="form-input"
                value={form.startDate}
                onChange={(e) => setForm({ ...form, startDate: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label className="form-label">End date</label>
              <input
                type="date"
                className="form-input"
                value={form.endDate}
                onChange={(e) => setForm({ ...form, endDate: e.target.value })}
                min={form.startDate}
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Notes</label>
            <textarea
              className="form-input form-textarea"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              rows={3}
              maxLength={1000}
              placeholder="Special requests or things you want to do..."
            />
          </div>

          <hr style={{ margin: 'var(--space-lg) 0' }} />

          <h3 className="mb-md">📍 Stops</h3>
          {stops.map((stop, idx) => (
            <div key={idx} className="card mb-sm" style={{ background: 'var(--bg-light)' }}>
              <div className="card-body">
                <div className="flex-between mb-sm">
                  <strong>Stop #{idx + 1}</strong>
                  {stops.length > 1 && (
                    <button type="button" onClick={() => removeStop(idx)} className="btn btn-ghost btn-sm">✕ Remove</button>
                  )}
                </div>
                <input
                  className="form-input mb-sm"
                  placeholder="Place name"
                  value={stop.name}
                  onChange={(e) => updateStop(idx, 'name', e.target.value)}
                  maxLength={200}
                />
                <input
                  className="form-input mb-sm"
                  placeholder="Address"
                  value={stop.address}
                  onChange={(e) => updateStop(idx, 'address', e.target.value)}
                  maxLength={300}
                />
                <textarea
                  className="form-input"
                  placeholder="Notes for this stop"
                  value={stop.notes}
                  onChange={(e) => updateStop(idx, 'notes', e.target.value)}
                  rows={2}
                  maxLength={500}
                />
              </div>
            </div>
          ))}
          <button type="button" onClick={addStop} className="btn btn-outline btn-block mb-lg">
            ➕ Add stop
          </button>

          {error && <div className="alert alert-error mb-md">{error}</div>}

          <div className="flex gap-md">
            <button type="submit" disabled={submitting} className="btn btn-primary flex-1">
              {submitting ? 'Creating...' : '✓ Create trip'}
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}
