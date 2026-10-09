'use client'

import { useState, useCallback } from 'react'
import { createClient } from '@/utils/supabase/auth'
import type { ItineraryStop } from '@/lib/types'
import { X, Check, Trash2, Loader2, Clock, MapPin, Tag, Car, Banknote, FileText, DoorOpen, Camera } from 'lucide-react'
import { fmtTime, fmtMinutes } from '@/lib/itinerary/times'

/**
 * Card detail drawer — opens on the right of the board when the
 * user clicks a card. Edits all per-card fields inline.
 *
 * Save semantics
 * ──────────────
 * Each save is a single UPDATE. The drawer optimistically closes
 * on success; the realtime subscription will re-emit the change to
 * the board without conflict (same `updated_at` write path).
 */
export default function CardDrawer({
  stop,
  canEdit,
  onClose,
  onSaved,
  onDeleted,
}: {
  stop: ItineraryStop
  canEdit: boolean
  onClose: () => void
  onSaved: (patch: Partial<ItineraryStop>) => Promise<void>
  onDeleted: (id: string) => Promise<void>
}) {
  const [name, setName] = useState(stop.name)
  const [address, setAddress] = useState(stop.address ?? '')
  const [category, setCategory] = useState(stop.category ?? '')
  const [startTime, setStartTime] = useState(stop.start_time?.slice(0, 5) ?? stop.planned_time?.slice(0, 5) ?? '')
  const [endTime, setEndTime] = useState(stop.end_time?.slice(0, 5) ?? '')
  const [duration, setDuration] = useState<string>(stop.duration_minutes != null ? String(stop.duration_minutes) : '')
  const [transport, setTransport] = useState(stop.transport ?? '')
  const [transportNote, setTransportNote] = useState(stop.transport_note ?? '')
  const [openingHours, setOpeningHours] = useState(stop.opening_hours ?? '')
  const [estCost, setEstCost] = useState<string>(stop.est_cost_cents != null ? String(stop.est_cost_cents) : '')
  const [photoUrl, setPhotoUrl] = useState(stop.photo_url ?? '')
  const [notes, setNotes] = useState(stop.notes ?? '')
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSave = useCallback(async () => {
    if (!name.trim()) {
      setError('Card name is required.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const dur = duration.trim() ? Number(duration) : null
      const cost = estCost.trim() ? Number(estCost) : null
      await onSaved({
        name: name.trim(),
        address: address.trim() || null,
        category: category.trim() || null,
        start_time: startTime || null,
        end_time: endTime || null,
        planned_time: startTime || null,
        duration_minutes: dur != null && !Number.isNaN(dur) ? dur : null,
        transport: transport.trim() || null,
        transport_note: transportNote.trim() || null,
        opening_hours: openingHours.trim() || null,
        est_cost_cents: cost != null && !Number.isNaN(cost) ? cost : null,
        photo_url: photoUrl.trim() || null,
        notes: notes.trim() || null,
      })
    } catch (e) {
      setError((e as Error).message ?? 'Could not save.')
    } finally {
      setSaving(false)
    }
  }, [name, address, category, startTime, endTime, duration, transport, transportNote, openingHours, estCost, photoUrl, notes, onSaved])

  const handleDelete = useCallback(async () => {
    if (!window.confirm(`Remove "${stop.name}" from this list? This cannot be undone.`)) return
    setDeleting(true)
    setError(null)
    try {
      await onDeleted(stop.id)
    } catch (e) {
      setError((e as Error).message ?? 'Could not delete.')
      setDeleting(false)
    }
  }, [stop.id, stop.name, onDeleted])

  return (
    <aside
      role="dialog"
      aria-modal="true"
      aria-labelledby="card-drawer-title"
      className="fixed inset-y-0 right-0 z-50 w-full sm:w-[420px] bg-surface border-l border-border shadow-xl flex flex-col"
    >
      <header className="px-5 py-3 border-b border-border flex items-center gap-2">
        <h2 id="card-drawer-title" className="text-sm font-semibold flex-1 truncate">
          {stop.name}
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close card details"
          className="inline-flex items-center justify-center w-8 h-8 text-muted hover:text-ink hover:bg-paper rounded-sm"
        >
          <X size={16} aria-hidden="true" />
        </button>
      </header>

      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
        {error ? (
          <div className="border border-danger bg-danger-bg text-danger rounded-sm px-3 py-2 text-xs" role="alert">
            {error}
          </div>
        ) : null}

        <Field label="Card name" required>
          <input
            type="text"
            required
            maxLength={200}
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={!canEdit}
            className="form-input"
            placeholder="e.g. Marble Mountains, Bún chả Cá"
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Start" icon={<Clock size={11} aria-hidden />}>
            <input
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              disabled={!canEdit}
              className="form-input"
            />
          </Field>
          <Field label="End" icon={<Clock size={11} aria-hidden />}>
            <input
              type="time"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              disabled={!canEdit}
              className="form-input"
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Stay (min)" icon={<Clock size={11} aria-hidden />}>
            <input
              type="number"
              min={0}
              max={1440}
              step={5}
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              disabled={!canEdit}
              className="form-input"
              placeholder="90"
            />
          </Field>
          <Field label="Est cost (VND)" icon={<Banknote size={11} aria-hidden />}>
            <input
              type="number"
              min={0}
              step={1000}
              value={estCost}
              onChange={(e) => setEstCost(e.target.value)}
              disabled={!canEdit}
              className="form-input"
              placeholder="100000"
            />
          </Field>
        </div>

        <Field label="Category" icon={<Tag size={11} aria-hidden />}>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            disabled={!canEdit}
            className="form-input"
          >
            <option value="">— pick one —</option>
            <option value="sight">Sight</option>
            <option value="food">Food</option>
            <option value="activity">Activity</option>
            <option value="transport">Transport</option>
            <option value="stay">Stay</option>
            <option value="other">Other</option>
          </select>
        </Field>

        <Field label="Address" icon={<MapPin size={11} aria-hidden />}>
          <input
            type="text"
            maxLength={300}
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            disabled={!canEdit}
            className="form-input"
            placeholder="81 Huyen Tran Cong Chua"
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="How you get there" icon={<Car size={11} aria-hidden />}>
            <select
              value={transport}
              onChange={(e) => setTransport(e.target.value)}
              disabled={!canEdit}
              className="form-input"
            >
              <option value="">—</option>
              <option value="walk">Walk</option>
              <option value="scooter">Scooter</option>
              <option value="taxi">Taxi</option>
              <option value="bike">Bike</option>
              <option value="car">Car</option>
            </select>
          </Field>
          <Field label="Opening hours" icon={<DoorOpen size={11} aria-hidden />}>
            <input
              type="text"
              maxLength={120}
              value={openingHours}
              onChange={(e) => setOpeningHours(e.target.value)}
              disabled={!canEdit}
              className="form-input"
              placeholder="06:00 – 18:00"
            />
          </Field>
        </div>

        <Field label="Transport note">
          <input
            type="text"
            maxLength={200}
            value={transportNote}
            onChange={(e) => setTransportNote(e.target.value)}
            disabled={!canEdit}
            className="form-input"
            placeholder="Bus 1 from Han Market, 15 min"
          />
        </Field>

        <Field label="Photo URL" icon={<Camera size={11} aria-hidden />}>
          <input
            type="url"
            maxLength={500}
            value={photoUrl}
            onChange={(e) => setPhotoUrl(e.target.value)}
            disabled={!canEdit}
            className="form-input"
            placeholder="https://…"
          />
        </Field>

        <Field label="Notes" icon={<FileText size={11} aria-hidden />}>
          <textarea
            rows={4}
            maxLength={1000}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            disabled={!canEdit}
            className="form-input form-textarea"
            placeholder="Reservation, dress code, what to order…"
          />
        </Field>

        <div className="text-[10px] text-subtle pt-2 border-t border-border">
          Created {new Date(stop.created_at).toLocaleString('en-US')}
        </div>
      </div>

      {canEdit ? (
        <footer className="px-5 py-3 border-t border-border flex items-center gap-2">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || deleting || !name.trim()}
            className="inline-flex items-center gap-1 h-9 px-4 text-sm font-medium rounded-sm bg-primary text-paper border border-primary hover:bg-primary-hover disabled:opacity-50"
          >
            {saving ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <Check size={14} aria-hidden="true" />}
            Save
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={saving || deleting}
            className="inline-flex items-center gap-1 h-9 px-3 text-sm font-medium rounded-sm bg-transparent text-danger border border-border-strong hover:bg-danger-bg disabled:opacity-50"
          >
            {deleting ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <Trash2 size={14} aria-hidden="true" />}
            Remove
          </button>
          <span className="ml-auto text-[10px] text-subtle tabular-nums">
            {fmtTime(stop.start_time ?? stop.planned_time) || 'no time'}
            {stop.duration_minutes ? ` · ${fmtMinutes(stop.duration_minutes)}` : ''}
          </span>
        </footer>
      ) : null}
    </aside>
  )
}

function Field({
  label,
  children,
  required,
  icon,
}: {
  label: string
  children: React.ReactNode
  required?: boolean
  icon?: React.ReactNode
}) {
  return (
    <div>
      <label className="block text-[11px] uppercase tracking-wide text-muted mb-1 inline-flex items-center gap-1">
        {icon}
        {label}
        {required ? <span className="text-danger" aria-hidden>*</span> : null}
      </label>
      {children}
    </div>
  )
}
