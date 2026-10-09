'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, MapPin, Calendar, FileText, Compass, Loader2, AlertTriangle, Check } from 'lucide-react'
import { createClient } from '@/utils/supabase/auth'

const FORM_LIMITS = {
  title: 120,
  notes: 1000,
} as const

/**
 * New-trip form. Just title + dates + notes — collaborators and the
 * first list/card can be added on the board page after creation.
 */
export default function NewItineraryPage() {
  const router = useRouter()
  const [form, setForm] = useState({ title: '', startDate: '', endDate: '', notes: '' })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!form.title.trim()) {
      setError('Please enter a trip name.')
      return
    }
    if (form.endDate && form.startDate && form.endDate < form.startDate) {
      setError('End date must be on or after start date.')
      return
    }
    setSubmitting(true)
    const sb = createClient()
    const { data: { user } } = await sb.auth.getUser()
    if (!user) {
      setError('You must be signed in.')
      setSubmitting(false)
      return
    }

    const { data: itin, error: itinErr } = await sb
      .from('itineraries')
      .insert({
        owner_id: user.id,
        title: form.title.trim(),
        destination: 'Da Nang',
        start_date: form.startDate || null,
        end_date: form.endDate || null,
        notes: form.notes.trim() || null,
        status: 'planning',
        last_editor_id: user.id,
      })
      .select()
      .single()
    if (itinErr || !itin) {
      setError('Could not create trip: ' + (itinErr?.message ?? ''))
      setSubmitting(false)
      return
    }
    router.push(`/itinerary/${itin.id}`)
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
    <main className="container-page py-6 lg:py-8">
      <nav className="mb-4 flex items-center gap-2 text-xs text-muted" aria-label="Breadcrumb">
        <Link href="/itinerary" className="hover:text-ink inline-flex items-center gap-1">
          <ArrowLeft size={11} aria-hidden /> Trips
        </Link>
        <span aria-hidden>/</span>
        <span className="text-ink">New</span>
      </nav>

      <header className="mb-6 pb-4 border-b border-border">
        <p className="text-eyebrow text-primary mb-2">
          New trip
          <span
            className="ml-2 italic text-muted"
            style={{ letterSpacing: '0.02em' }}
            aria-hidden
          >
            chuyến mới
          </span>
        </p>
        <h1 className="text-page-title mb-1">Plan a Da Nang trip</h1>
        <p className="text-sm text-muted max-w-xl">
          Pick dates and a name. You can add lists and cards on the board after creating.
        </p>
      </header>

      <form onSubmit={handleSubmit} className="max-w-2xl space-y-4" noValidate>
        <fieldset className="border border-border rounded-sm bg-surface p-5">
          <legend className="px-2 text-[11px] uppercase tracking-wide text-muted inline-flex items-center gap-1">
            <Compass size={11} aria-hidden /> Trip details
          </legend>

          <div className="form-group">
            <label htmlFor="title" className="form-label">
              Trip name <span className="text-danger" aria-hidden>*</span>
            </label>
            <input
              id="title"
              type="text"
              required
              maxLength={FORM_LIMITS.title}
              placeholder="e.g. Da Nang Beach Adventure"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              className="form-input"
              aria-describedby="title-hint"
              autoFocus
            />
            <p id="title-hint" className="form-hint" style={{ fontVariantNumeric: 'tabular-nums' }}>
              {FORM_LIMITS.title - form.title.length} characters left
            </p>
          </div>

          <div className="form-group">
            <span className="form-label">Destination</span>
            <div className="flex items-center gap-2 h-10 px-3 bg-paper border border-border rounded-sm text-sm text-ink">
              <MapPin size={13} className="text-primary flex-shrink-0" aria-hidden />
              <span>Da Nang, Vietnam</span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="form-group">
              <label htmlFor="startDate" className="form-label inline-flex items-center gap-1">
                <Calendar size={11} aria-hidden /> Start
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
              <label htmlFor="endDate" className="form-label inline-flex items-center gap-1">
                <Calendar size={11} aria-hidden /> End
              </label>
              <input
                id="endDate"
                type="date"
                min={form.startDate}
                value={form.endDate}
                onChange={(e) => setForm({ ...form, endDate: e.target.value })}
                className="form-input"
              />
            </div>
          </div>
          {dayCount !== null ? (
            <p className="text-xs text-muted inline-flex items-center gap-1 -mt-1 mb-3" style={{ fontVariantNumeric: 'tabular-nums' }}>
              <Calendar size={11} aria-hidden /> {dayCount} day{dayCount === 1 ? '' : 's'} total
            </p>
          ) : null}

          <div className="form-group">
            <label htmlFor="notes" className="form-label inline-flex items-center gap-1">
              <FileText size={11} aria-hidden /> Notes
            </label>
            <textarea
              id="notes"
              rows={3}
              maxLength={FORM_LIMITS.notes}
              placeholder="Special requests, things you want to do, dietary needs…"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              className="form-input form-textarea"
              aria-describedby="notes-hint"
            />
            <p id="notes-hint" className="form-hint" style={{ fontVariantNumeric: 'tabular-nums' }}>
              {FORM_LIMITS.notes - form.notes.length} characters left
            </p>
          </div>
        </fieldset>

        {error ? (
          <div className="border border-danger bg-danger-bg text-danger rounded-sm px-4 py-3 flex items-center gap-2" role="alert">
            <AlertTriangle size={14} aria-hidden />
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
                <Loader2 size={16} className="animate-spin" aria-hidden /> Creating…
              </>
            ) : (
              <>
                <Check size={16} aria-hidden /> Create trip
              </>
            )}
          </button>
          <Link
            href="/itinerary"
            className="inline-flex items-center h-11 px-5 text-sm font-medium rounded-sm bg-transparent text-ink border border-border-strong hover:bg-paper"
          >
            Cancel
          </Link>
        </div>
      </form>
    </main>
  )
}
