'use client'

import { useEffect, useState, useTransition, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft,
  MapPin,
  Calendar,
  Star,
  Pencil,
  Trash2,
  Plus,
  Check,
  X,
  Loader2,
  Compass,
  AlertTriangle,
} from 'lucide-react'
import { createClient } from '@/utils/supabase/auth'
import type { Trip, TripStop } from '@/lib/types'
import { Avatar } from '@/components/ui/Avatar'

const today = () => new Date().toISOString().slice(0, 10)

export default function TripDetailPage() {
  const params = useParams()
  const router = useRouter()
  const tripId = params?.id as string
  const [trip, setTrip] = useState<Trip | null>(null)
  const [stops, setStops] = useState<TripStop[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [editingTrip, setEditingTrip] = useState(false)
  const [editingStopId, setEditingStopId] = useState<string | null>(null)
  const [addingStop, setAddingStop] = useState(false)

  const load = useCallback(async () => {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      router.push(`/login?redirect=/trips/${tripId}`)
      return
    }
    const [{ data: t, error: tErr }, { data: s, error: sErr }] = await Promise.all([
      supabase
        .from('trips')
        .select(
          '*, buddy:buddies(*, profile:safe_profiles(full_name, avatar_url, is_online))',
        )
        .eq('id', tripId)
        .maybeSingle(),
      supabase
        .from('trip_stops')
        .select('*')
        .eq('trip_id', tripId)
        .order('stop_order', { ascending: true }),
    ])
    if (tErr) setLoadError(tErr.message)
    if (sErr) setLoadError((prev) => prev ?? sErr.message)
    setTrip((t as Trip) ?? null)
    setStops((s as TripStop[]) ?? [])
    setLoading(false)
  }, [tripId])

  useEffect(() => {
    if (tripId) load()
  }, [tripId, load])

  async function patchTrip(patch: Partial<Trip>) {
    if (!trip) return
    setActionError(null)
    startTransition(async () => {
      const supabase = createClient()
      const { error } = await supabase
        .from('trips')
        .update(patch)
        .eq('id', trip.id)
      if (error) {
        setActionError(error.message)
        return
      }
      setTrip({ ...trip, ...patch })
    })
  }

  async function deleteTrip() {
    if (!trip) return
    if (!window.confirm('Delete this trip and all its stops? This cannot be undone.')) return
    setActionError(null)
    startTransition(async () => {
      const supabase = createClient()
      const { error } = await supabase.from('trips').delete().eq('id', trip.id)
      if (error) {
        setActionError(error.message)
        return
      }
      router.push('/trips')
    })
  }

  async function addStop(input: { name: string; address: string; notes: string }) {
    if (!trip) return
    setActionError(null)
    startTransition(async () => {
      const supabase = createClient()
      const order = stops.length > 0 ? Math.max(...stops.map((s) => s.stop_order)) + 1 : 1
      const { data, error } = await supabase
        .from('trip_stops')
        .insert({
          trip_id: trip.id,
          stop_order: order,
          name: input.name,
          address: input.address || null,
          notes: input.notes || null,
        })
        .select()
        .single()
      if (error || !data) {
        setActionError(error?.message ?? 'Failed to add stop.')
        return
      }
      setStops([...stops, data as TripStop])
      setAddingStop(false)
    })
  }

  async function updateStop(stopId: string, patch: Partial<TripStop>) {
    setActionError(null)
    startTransition(async () => {
      const supabase = createClient()
      const { error } = await supabase
        .from('trip_stops')
        .update(patch)
        .eq('id', stopId)
      if (error) {
        setActionError(error.message)
        return
      }
      setStops((prev) => prev.map((s) => (s.id === stopId ? { ...s, ...patch } : s)))
      setEditingStopId(null)
    })
  }

  async function deleteStop(stopId: string) {
    if (!window.confirm('Remove this stop?')) return
    setActionError(null)
    startTransition(async () => {
      const supabase = createClient()
      const { error } = await supabase.from('trip_stops').delete().eq('id', stopId)
      if (error) {
        setActionError(error.message)
        return
      }
      setStops((prev) => prev.filter((s) => s.id !== stopId))
    })
  }

  if (loading) {
    return (
      <div className="container-page py-16 text-center">
        <div className="loading-spinner mx-auto" />
      </div>
    )
  }
  if (!trip) {
    return (
      <div className="container-page py-16">
        <p className="text-muted">Trip not found.</p>
        <Link
          href="/trips"
          className="inline-flex items-center gap-1 mt-3 text-sm text-primary hover:underline"
        >
          <ArrowLeft size={14} aria-hidden="true" />
          Back to trips
        </Link>
      </div>
    )
  }

  const buddy = trip.buddy as any
  const statusBadge =
    trip.status === 'confirmed'
      ? 'badge-success'
      : trip.status === 'completed'
        ? 'badge-info'
        : trip.status === 'cancelled'
          ? 'badge-danger'
          : 'badge-warning'
  const dayCount =
    trip.start_date && trip.end_date
      ? Math.max(
          1,
          Math.round(
            (new Date(trip.end_date).getTime() - new Date(trip.start_date).getTime()) /
              (1000 * 60 * 60 * 24),
          ) + 1,
        )
      : null

  return (
    <div className="container-page py-6 lg:py-8 space-y-4">
      {/* Back link */}
      <Link
        href="/trips"
        className="inline-flex items-center gap-1 text-sm text-muted hover:text-ink"
      >
        <ArrowLeft size={14} aria-hidden="true" />
        All trips
      </Link>

      {/* Hero — same pattern as /trips/create but quieter (opacity 0.14) */}
      <section
        className="relative overflow-hidden border border-border rounded-sm bg-surface"
        aria-label="Trip header"
      >
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{
            backgroundImage:
              "url('https://images.unsplash.com/photo-1572551562325-b5d5057c9b54?w=1600&q=70&auto=format&fit=crop')",
            opacity: 0.14,
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
            Trip
            <span
              className="ml-2 italic text-muted"
              style={{ letterSpacing: '0.02em' }}
              aria-hidden="true"
            >
              chuyến đi
            </span>
          </p>
          <h1 className="text-page-title mb-2">{trip.title}</h1>
          <p className="text-sm text-muted max-w-xl inline-flex items-center gap-2">
            <MapPin size={13} aria-hidden="true" />
            {trip.destination || 'Da Nang'}
            {trip.start_date ? (
              <>
                <span className="mx-1 text-subtle">·</span>
                <Calendar size={13} aria-hidden="true" />
                {new Date(trip.start_date).toLocaleDateString('en-US')}
                {' – '}
                {trip.end_date ? new Date(trip.end_date).toLocaleDateString('en-US') : '…'}
              </>
            ) : null}
          </p>
          <div className="flex flex-wrap items-center gap-2 mt-3">
            <span className={`badge ${statusBadge} text-xs`}>{trip.status}</span>
            {dayCount !== null ? (
              <span
                className="badge badge-success text-xs"
                style={{ fontVariantNumeric: 'tabular-nums' }}
              >
                {dayCount} day{dayCount === 1 ? '' : 's'}
              </span>
            ) : null}
            <span
              className="badge badge-primary text-xs"
              style={{ fontVariantNumeric: 'tabular-nums' }}
            >
              {stops.length} stop{stops.length === 1 ? '' : 's'}
            </span>
            {buddy ? (
              <span className="text-xs text-muted inline-flex items-center gap-1">
                <Avatar name={buddy.profile?.full_name ?? 'Buddy'} size="xs" />
                {buddy.profile?.full_name ?? 'Assigned buddy'}
              </span>
            ) : (
              <span className="badge badge-warning text-xs">No buddy yet</span>
            )}
          </div>
        </div>
      </section>

      {loadError ? (
        <div className="alert alert-error" role="alert">
          <AlertTriangle size={14} aria-hidden="true" />
          <span>{loadError}</span>
          <button
            type="button"
            onClick={() => {
              setLoading(true)
              setLoadError(null)
              load()
            }}
            className="ml-auto inline-flex items-center h-9 px-3 text-sm font-medium rounded-sm bg-transparent text-ink border border-border-strong hover:bg-paper"
          >
            Retry
          </button>
        </div>
      ) : null}

      {actionError ? (
        <div className="alert alert-error" role="alert">
          <X size={14} aria-hidden="true" />
          <span>{actionError}</span>
          <button
            type="button"
            onClick={() => setActionError(null)}
            aria-label="Dismiss error"
            className="ml-auto text-muted hover:text-ink"
          >
            <X size={12} aria-hidden="true" />
          </button>
        </div>
      ) : null}

      {/* Trip details — editable */}
      <fieldset className="border border-border rounded-sm bg-surface p-5">
        <legend className="px-2 text-[11px] uppercase tracking-wide text-muted inline-flex items-center gap-1">
          <Compass size={11} aria-hidden="true" /> Trip details
        </legend>

        {editingTrip ? (
          <TripEditForm
            trip={trip}
            onCancel={() => setEditingTrip(false)}
            onSave={async (patch) => {
              await patchTrip(patch)
              setEditingTrip(false)
            }}
            saving={isPending}
          />
        ) : (
          <div className="space-y-3">
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
              <div>
                  <dt className="text-[10px] tracking-wide uppercase text-muted">Title</dt>
                  <dd className="text-sm text-ink">{trip.title}</dd>
                </div>
                <div>
                  <dt className="text-[10px] tracking-wide uppercase text-muted">Dates</dt>
                  <dd
                    className="text-sm text-ink"
                    style={{ fontVariantNumeric: 'tabular-nums' }}
                  >
                    {trip.start_date ? new Date(trip.start_date).toLocaleDateString('en-US') : '—'}
                    {' → '}
                    {trip.end_date ? new Date(trip.end_date).toLocaleDateString('en-US') : '—'}
                  </dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className="text-[10px] tracking-wide uppercase text-muted">Notes for your buddy</dt>
                  <dd className="text-sm text-ink leading-relaxed">
                    {trip.notes ? (
                      trip.notes
                    ) : (
                      <span className="text-subtle italic">No notes yet — click Edit to add some.</span>
                    )}
                  </dd>
                </div>
            </dl>
            <div className="flex flex-wrap gap-2 pt-2 border-t border-border">
              <button
                type="button"
                onClick={() => setEditingTrip(true)}
                className="inline-flex items-center gap-1 h-9 px-3 text-sm font-medium rounded-sm bg-transparent text-ink border border-border-strong hover:bg-paper"
              >
                <Pencil size={13} aria-hidden="true" />
                Edit details
              </button>
              <button
                type="button"
                onClick={deleteTrip}
                disabled={isPending}
                className="inline-flex items-center gap-1 h-9 px-3 text-sm font-medium rounded-sm bg-transparent text-danger border border-border-strong hover:bg-danger-bg disabled:opacity-50"
              >
                <Trash2 size={13} aria-hidden="true" />
                Delete trip
              </button>
            </div>
          </div>
        )}
      </fieldset>

      {/* Stops */}
      <fieldset className="border border-border rounded-sm bg-surface p-5">
        <legend className="px-2 text-[11px] uppercase tracking-wide text-muted inline-flex items-center gap-1">
          <MapPin size={11} aria-hidden="true" /> Stops
        </legend>

        {stops.length === 0 && !addingStop ? (
          <p className="text-sm text-muted py-4">
            No stops yet. Add the first place you want to visit.
          </p>
        ) : (
          <ol className="border-t border-border first:border-t-0 -mx-5">
            {stops.map((stop, idx) => (
              <li key={stop.id} className="border-b border-border last:border-b-0">
                {editingStopId === stop.id ? (
                  <StopEditForm
                    stop={stop}
                    onCancel={() => setEditingStopId(null)}
                    onSave={(patch) => updateStop(stop.id, patch)}
                    saving={isPending}
                  />
                ) : (
                  <div className="flex items-start gap-3 px-5 py-4">
                    <span
                      className="inline-flex items-center justify-center w-7 h-7 rounded-sm bg-primary text-paper text-xs font-semibold flex-shrink-0"
                      style={{ fontVariantNumeric: 'tabular-nums' }}
                      aria-hidden="true"
                    >
                      {idx + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-ink">{stop.name}</p>
                      {stop.address ? (
                        <p className="text-xs text-muted mt-1 inline-flex items-center gap-1">
                          <MapPin size={11} aria-hidden="true" />
                          {stop.address}
                        </p>
                      ) : null}
                      {stop.notes ? (
                        <p className="text-sm text-ink leading-relaxed mt-2">{stop.notes}</p>
                      ) : null}
                    </div>
                    <div className="flex flex-col gap-1 flex-shrink-0">
                      <button
                        type="button"
                        onClick={() => setEditingStopId(stop.id)}
                        aria-label={`Edit stop ${idx + 1}`}
                        className="inline-flex items-center justify-center w-7 h-7 text-ink hover:bg-paper border border-border rounded-sm"
                      >
                        <Pencil size={12} aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteStop(stop.id)}
                        aria-label={`Remove stop ${idx + 1}`}
                        className="inline-flex items-center justify-center w-7 h-7 text-muted hover:text-danger hover:bg-danger-bg border border-border rounded-sm"
                      >
                        <Trash2 size={12} aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ol>
        )}

        {addingStop ? (
          <div className="px-5 py-4 border-t border-border bg-paper">
            <StopEditForm
              stop={null}
              onCancel={() => setAddingStop(false)}
              onSave={(patch) =>
                addStop({
                  name: patch.name ?? '',
                  address: patch.address ?? '',
                  notes: patch.notes ?? '',
                })
              }
              saving={isPending}
            />
          </div>
        ) : (
          <div className="pt-3">
            <button
              type="button"
              onClick={() => setAddingStop(true)}
              className="inline-flex items-center gap-1 h-9 px-3 text-sm font-medium rounded-sm bg-transparent text-ink border border-border-strong hover:bg-paper"
            >
              <Plus size={14} aria-hidden="true" />
              Add stop
            </button>
          </div>
        )}
      </fieldset>

      {trip.status === 'completed' && buddy ? (
        <section className="border border-border rounded-sm bg-surface p-5 text-center">
          <h2 className="text-base font-semibold mb-1">How was your trip?</h2>
          <p className="text-sm text-muted mb-3">
            Leave a review for {buddy.profile?.full_name ?? 'your buddy'} so other travelers can
            benefit.
          </p>
          <Link
            href={`/review/${trip.id}`}
            className="inline-flex items-center gap-1 h-10 px-4 text-sm font-medium rounded-sm bg-primary text-paper border border-primary hover:bg-primary-hover"
          >
            <Star size={15} aria-hidden="true" />
            Review {buddy.profile?.full_name?.split(' ')[0] ?? 'Buddy'}
          </Link>
        </section>
      ) : null}
    </div>
  )
}

interface TripEditFormProps {
  trip: Trip
  onCancel: () => void
  onSave: (patch: Partial<Trip>) => Promise<void>
  saving: boolean
}

function TripEditForm({ trip, onCancel, onSave, saving }: TripEditFormProps) {
  const [title, setTitle] = useState(trip.title)
  const [startDate, setStartDate] = useState(trip.start_date ?? '')
  const [endDate, setEndDate] = useState(trip.end_date ?? '')
  const [notes, setNotes] = useState(trip.notes ?? '')
  const [status, setStatus] = useState<Trip['status']>(trip.status)

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault()
        if (!title.trim()) return
        if (endDate && startDate && endDate < startDate) return
        await onSave({
          title: title.trim(),
          start_date: startDate || null,
          end_date: endDate || null,
          notes: notes.trim() || null,
          status,
        })
      }}
      className="space-y-3"
    >
      <div className="form-group">
        <label htmlFor="edit-title" className="form-label">
          Title <span className="text-danger" aria-hidden="true">*</span>
        </label>
        <input
          id="edit-title"
          type="text"
          required
          maxLength={200}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="form-input"
        />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="form-group">
          <label htmlFor="edit-start" className="form-label">Start</label>
          <input
            id="edit-start"
            type="date"
            min={today()}
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="form-input"
          />
        </div>
        <div className="form-group">
          <label htmlFor="edit-end" className="form-label">End</label>
          <input
            id="edit-end"
            type="date"
            min={startDate || today()}
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="form-input"
          />
        </div>
        <div className="form-group">
          <label htmlFor="edit-status" className="form-label">Status</label>
          <select
            id="edit-status"
            value={status}
            onChange={(e) => setStatus(e.target.value as Trip['status'])}
            className="form-input"
          >
            <option value="planning">planning</option>
            <option value="confirmed">confirmed</option>
            <option value="completed">completed</option>
            <option value="cancelled">cancelled</option>
          </select>
        </div>
      </div>
      <div className="form-group">
        <label htmlFor="edit-notes" className="form-label">Notes for your buddy</label>
        <textarea
          id="edit-notes"
          rows={3}
          maxLength={1000}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="form-input form-textarea"
        />
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={saving || !title.trim()}
          className="inline-flex items-center gap-1 h-9 px-3 text-sm font-medium rounded-sm bg-primary text-paper border border-primary hover:bg-primary-hover disabled:opacity-50"
        >
          {saving ? (
            <Loader2 size={13} className="animate-spin" aria-hidden="true" />
          ) : (
            <Check size={13} aria-hidden="true" />
          )}
          Save
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="inline-flex items-center gap-1 h-9 px-3 text-sm font-medium rounded-sm bg-transparent text-ink border border-border-strong hover:bg-paper"
        >
          <X size={13} aria-hidden="true" />
          Cancel
        </button>
      </div>
    </form>
  )
}

interface StopEditFormProps {
  stop: TripStop | null
  onCancel: () => void
  onSave: (patch: Partial<TripStop>) => Promise<void>
  saving: boolean
}

function StopEditForm({ stop, onCancel, onSave, saving }: StopEditFormProps) {
  const [name, setName] = useState(stop?.name ?? '')
  const [address, setAddress] = useState(stop?.address ?? '')
  const [notes, setNotes] = useState(stop?.notes ?? '')

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault()
        if (!name.trim()) return
        await onSave({
          name: name.trim(),
          address: address.trim() || null,
          notes: notes.trim() || null,
        })
      }}
      className="space-y-2"
    >
      <div className="form-group">
        <label htmlFor={`stop-name-${stop?.id ?? 'new'}`} className="form-label">
          Name <span className="text-danger" aria-hidden="true">*</span>
        </label>
        <input
          id={`stop-name-${stop?.id ?? 'new'}`}
          type="text"
          required
          maxLength={200}
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="form-input"
          autoFocus
        />
      </div>
      <div className="form-group">
        <label htmlFor={`stop-address-${stop?.id ?? 'new'}`} className="form-label">Address</label>
        <input
          id={`stop-address-${stop?.id ?? 'new'}`}
          type="text"
          maxLength={300}
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          className="form-input"
        />
      </div>
      <div className="form-group">
        <label htmlFor={`stop-notes-${stop?.id ?? 'new'}`} className="form-label">Notes</label>
        <textarea
          id={`stop-notes-${stop?.id ?? 'new'}`}
          rows={2}
          maxLength={500}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="form-input form-textarea"
        />
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={saving || !name.trim()}
          className="inline-flex items-center gap-1 h-9 px-3 text-sm font-medium rounded-sm bg-primary text-paper border border-primary hover:bg-primary-hover disabled:opacity-50"
        >
          {saving ? (
            <Loader2 size={13} className="animate-spin" aria-hidden="true" />
          ) : (
            <Check size={13} aria-hidden="true" />
          )}
          {stop ? 'Save' : 'Add stop'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="inline-flex items-center gap-1 h-9 px-3 text-sm font-medium rounded-sm bg-transparent text-ink border border-border-strong hover:bg-paper"
        >
          <X size={13} aria-hidden="true" />
          Cancel
        </button>
      </div>
    </form>
  )
}