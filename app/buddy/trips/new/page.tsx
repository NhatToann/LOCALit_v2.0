'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Plus, X, Check, MapPin, Users, ArrowRight, ArrowLeft } from 'lucide-react'
import { createClient } from '@/utils/supabase/auth'

interface TravelerOption {
  connectionId: string
  touristId: string
  name: string
  avatarUrl: string | null
}

interface Stop {
  name: string
  address: string
  notes: string
}

/**
 * Buddy-initiated new-trip wizard.
 *
 * Step 0: pick a traveler (one of the buddy's accepted connections).
 * Step 1: trip details + a few optional stops. On submit, INSERT into
 * `trips` with buddy_id = me.id and tourist_id = the chosen traveler.
 * Then jumps to /itinerary/<connId> where DaysTab already lives.
 */
export default function NewBuddyTripPage() {
  const router = useRouter()
  const [travelers, setTravelers] = useState<TravelerOption[]>([])
  const [step, setStep] = useState<0 | 1>(0)
  const [chosen, setChosen] = useState<TravelerOption | null>(null)
  const [form, setForm] = useState({
    title: '',
    destination: 'Da Nang',
    startDate: '',
    endDate: '',
    notes: '',
  })
  const [stops, setStops] = useState<Stop[]>([{ name: '', address: '', notes: '' }])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        setError('Please sign in as a buddy.')
        setLoading(false)
        return
      }
      const { data: rows } = await supabase
        .from('connections')
        .select('id, tourist_id, tourist:tourists(id, profile:safe_profiles(id, full_name, avatar_url))')
        .eq('buddy_id', user.id)
        .eq('status', 'accepted')
      const opts: TravelerOption[] = []
      for (const row of rows || []) {
        const t: any = row.tourist
        if (!t?.profile) continue
        opts.push({
          connectionId: row.id,
          touristId: t.id,
          name: t.profile.full_name ?? 'Traveler',
          avatarUrl: t.profile.avatar_url ?? null,
        })
      }
      if (!cancelled) {
        setTravelers(opts)
        setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  function addStop() {
    setStops([...stops, { name: '', address: '', notes: '' }])
  }
  function removeStop(idx: number) {
    if (stops.length === 1) return
    setStops(stops.filter((_, i) => i !== idx))
  }
  function updateStop(idx: number, field: keyof Stop, value: string) {
    setStops(stops.map((s, i) => (i === idx ? { ...s, [field]: value } : s)))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!chosen) {
      setError('Pick a traveler first.')
      setStep(0)
      return
    }
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
        buddy_id: user.id,
        tourist_id: chosen.touristId,
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
      setError('Could not create trip: ' + (tripError?.message || 'unknown error'))
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
    // Auto-create a trip_travelers row so the lead traveler shows up in
    // the multi-party UI (the buddy already operates on it directly
    // via trip.tourist_id, but trip_travelers is the canonical list).
    await supabase.from('trip_travelers').upsert(
      {
        trip_id: trip.id,
        tourist_id: chosen.touristId,
        role: 'lead',
        status: 'accepted',
        invited_by: user.id,
      },
      { onConflict: 'trip_id,tourist_id' },
    )

    router.push(`/itinerary/${chosen.connectionId}?trip=${trip.id}`)
  }

  if (loading) {
    return (
      <div className="container-page py-8">
        <div className="loading-spinner mx-auto my-12" />
      </div>
    )
  }

  if (travelers.length === 0) {
    return (
      <div className="container-page py-8 max-w-2xl">
        <header className="mb-6">
          <p className="text-eyebrow text-primary mb-2">New plan</p>
          <h1 className="text-page-title">No travelers to plan for yet</h1>
          <p className="text-sm text-muted mt-2 max-w-prose">
            You need at least one accepted connection before you can draft a new plan. Wait for a tourist to send a request, or open your{' '}
            <Link href="/buddy/requests" className="text-primary hover:underline">
              request inbox
            </Link>
            .
          </p>
        </header>
        <Link href="/buddy/dashboard" className="btn btn-primary mt-2">
          Back to dashboard
        </Link>
      </div>
    )
  }

  return (
    <div className="container-page py-8 max-w-2xl">
      <header className="mb-6">
        <p className="text-eyebrow text-primary mb-2">New plan</p>
        <h1 className="text-page-title">Plan a trip for a traveler</h1>
        <p className="text-sm text-muted mt-1 max-w-prose">
          You can create as many plans as you want — one per traveler or several for the same traveler (weekend, full week, day trip, etc.).
        </p>
      </header>

      <ol className="flex items-center gap-2 mb-6 text-xs" aria-label="Progress">
        {[0, 1].map((i) => (
          <li
            key={i}
            className={`flex items-center gap-1 px-2 py-1 rounded-sm ${
              step === i ? 'bg-primary text-paper' : i < step ? 'bg-success-bg text-success' : 'bg-paper text-muted border border-border'
            }`}
          >
            <span className="font-mono">{i + 1}</span>
            <span>{i === 0 ? 'Traveler' : 'Details'}</span>
          </li>
        ))}
      </ol>

      {error ? (
        <div className="alert alert-error mb-4" role="alert">
          {error}
        </div>
      ) : null}

      {step === 0 ? (
        <fieldset className="border border-border rounded-sm bg-surface p-6">
          <legend className="px-2 text-sm font-semibold text-ink">
            <Users size={13} className="inline mr-1 align-middle" aria-hidden="true" />
            Pick a traveler
          </legend>
          <ul className="divide-y divide-border" role="radiogroup" aria-label="Traveler">
            {travelers.map((t) => {
              const isChosen = chosen?.touristId === t.touristId
              return (
                <li key={t.connectionId}>
                  <button
                    type="button"
                    onClick={() => setChosen(t)}
                    aria-checked={isChosen}
                    role="radio"
                    className={`w-full text-left flex items-center gap-3 py-3 px-2 -mx-2 rounded-sm transition-colors ${
                      isChosen ? 'bg-primary/5 ring-1 ring-primary' : 'hover:bg-paper'
                    }`}
                  >
                    <div
                      className="w-8 h-8 rounded-sm bg-paper border border-border flex items-center justify-center text-sm font-semibold uppercase"
                      aria-hidden="true"
                    >
                      {t.avatarUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={t.avatarUrl} alt="" className="w-full h-full object-cover rounded-sm" />
                      ) : (
                        t.name.slice(0, 1)
                      )}
                    </div>
                    <span className="flex-1 text-sm font-medium text-ink">{t.name}</span>
                    {isChosen ? <Check size={14} className="text-primary" aria-hidden="true" /> : null}
                  </button>
                </li>
              )
            })}
          </ul>
          <div className="flex justify-end mt-6">
            <button
              type="button"
              disabled={!chosen}
              onClick={() => setStep(1)}
              className="btn btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next: trip details <ArrowRight size={14} aria-hidden="true" />
            </button>
          </div>
        </fieldset>
      ) : (
        <form onSubmit={handleSubmit} noValidate>
          <fieldset className="border border-border rounded-sm bg-surface p-6 mb-6">
            <legend className="px-2 text-sm font-semibold text-ink">Traveler</legend>
            <div className="flex items-center justify-between">
              <p className="text-sm text-ink">
                Planning for <strong>{chosen?.name}</strong>
              </p>
              <button
                type="button"
                onClick={() => setStep(0)}
                className="inline-flex items-center gap-1 text-xs text-muted hover:text-ink"
              >
                <ArrowLeft size={11} aria-hidden="true" /> Change
              </button>
            </div>
          </fieldset>

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
                placeholder="e.g. Weekend in Hoi An"
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
                Notes for the traveler
              </label>
              <textarea
                id="notes"
                rows={3}
                maxLength={1000}
                placeholder="Special requests, what you want to do together…"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                className="form-input form-textarea"
              />
              <p className="form-hint">{form.notes.length}/1000 characters</p>
            </div>
          </fieldset>

          <fieldset className="border border-border rounded-sm bg-surface p-6 mb-6">
            <legend className="px-2 text-sm font-semibold text-ink">Suggested stops</legend>
            <p className="text-xs text-muted mb-3">
              Optional — you can always add more from the itinerary page later.
            </p>

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
              className="inline-flex items-center gap-1 text-xs text-primary hover:underline mt-2"
            >
              <Plus size={12} aria-hidden="true" /> Add another stop
            </button>
          </fieldset>

          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => setStep(0)}
              className="inline-flex items-center gap-1 text-sm text-muted hover:text-ink"
            >
              <ArrowLeft size={13} aria-hidden="true" />
              Back
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="btn btn-primary"
            >
              {submitting ? 'Creating…' : 'Create plan'}
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
