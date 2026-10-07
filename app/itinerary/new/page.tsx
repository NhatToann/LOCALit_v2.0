'use client'

import { useState, useTransition } from 'react'
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
  Loader2,
  UserPlus,
  Mail,
  ArrowLeft,
  AlertTriangle,
} from 'lucide-react'
import { createClient } from '@/utils/supabase/auth'

const today = () => new Date().toISOString().slice(0, 10)
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const FORM_LIMITS = {
  title: 120,
  notes: 1000,
} as const

export default function NewItineraryPage() {
  const router = useRouter()
  const [form, setForm] = useState({ title: '', startDate: '', endDate: '', notes: '' })
  const [emails, setEmails] = useState<string[]>([])
  const [newEmail, setNewEmail] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [, startTransition] = useTransition()

  function addEmail() {
    const e = newEmail.trim().toLowerCase()
    if (!e) return
    if (!EMAIL_RE.test(e)) {
      setError(`"${newEmail}" is not a valid email.`)
      return
    }
    if (emails.includes(e)) {
      setError(`${e} is already added.`)
      return
    }
    setEmails([...emails, e])
    setNewEmail('')
    setError('')
  }

  function removeEmail(e: string) {
    setEmails(emails.filter((x) => x !== e))
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
    setSubmitting(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setError('You must be signed in.')
      setSubmitting(false)
      return
    }

    const { data: itin, error: itinErr } = await supabase
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
      setError('Could not create itinerary: ' + (itinErr?.message ?? ''))
      setSubmitting(false)
      return
    }

    // Best-effort collaborator invite. RLS lets the owner insert rows
    // for any user_id; we look up by email and skip unknown addresses.
    if (emails.length > 0) {
      startTransition(async () => {
        try {
          const { data: targets } = await supabase
            .from('profiles')
            .select('id, email')
            .in('email', emails)
          if (targets && targets.length > 0) {
            await supabase.from('itinerary_collaborators').insert(
              targets
                .filter((t) => t.id !== user.id)
                .map((t) => ({
                  itinerary_id: itin.id,
                  user_id: t.id,
                  role: 'editor' as const,
                  status: 'invited' as const,
                  invited_by: user.id,
                })),
            )
          }
        } catch (_) {
          // RLS may block profiles read; collaborators added later from
          // the editor. Don't block the redirect.
        }
        router.push(`/itinerary/${itin.id}`)
      })
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

  const titleLeft = FORM_LIMITS.title - form.title.length
  const notesLeft = FORM_LIMITS.notes - form.notes.length

  return (
    <div className="container-page py-6 lg:py-8">
      {/* Breadcrumb */}
      <nav className="mb-4 flex items-center gap-2 text-xs text-muted" aria-label="Breadcrumb">
        <Link href="/dashboard" className="hover:text-ink inline-flex items-center gap-1">
          <ArrowLeft size={11} aria-hidden="true" /> Dashboard
        </Link>
        <span aria-hidden="true">/</span>
        <Link href="/itinerary" className="hover:text-ink">
          Itineraries
        </Link>
        <span aria-hidden="true">/</span>
        <span className="text-ink">New</span>
      </nav>

      {/* Compact header — no cover photo */}
      <header className="mb-6 pb-4 border-b border-border">
        <p className="text-eyebrow text-primary mb-2">
          New itinerary
          <span className="ml-2 italic text-muted" style={{ letterSpacing: '0.02em' }} aria-hidden="true">
            lịch trình mới
          </span>
        </p>
        <h1 className="text-page-title mb-1">Plan a Da Nang trip</h1>
        <p className="text-sm text-muted max-w-xl">
          Pick dates, jot a few notes, and invite collaborators. You can add stops and days after creating.
        </p>
      </header>

      <form onSubmit={handleSubmit} className="max-w-2xl space-y-4" noValidate>
        {/* Trip details */}
        <fieldset className="border border-border rounded-sm bg-[#FFFFFF] p-5">
          <legend className="px-2 text-[11px] uppercase tracking-wide text-muted inline-flex items-center gap-1">
            <Compass size={11} aria-hidden="true" /> Trip details
          </legend>

          <div className="form-group">
            <label htmlFor="title" className="form-label">
              Trip name <span className="text-danger" aria-hidden="true">*</span>
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
            />
            <p id="title-hint" className="form-hint" style={{ fontVariantNumeric: 'tabular-nums' }}>
              {titleLeft} characters left
            </p>
          </div>

          <div className="form-group">
            <span className="form-label">Destination</span>
            <div className="flex items-center gap-2 h-10 px-3 bg-paper border border-border rounded-sm text-sm text-ink">
              <MapPin size={13} className="text-primary flex-shrink-0" aria-hidden="true" />
              <span>Da Nang, Vietnam</span>
              <span className="ml-auto text-[10px] uppercase tracking-wide text-muted">
                fixed at launch
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="form-group">
              <label htmlFor="startDate" className="form-label inline-flex items-center gap-1">
                <Calendar size={11} aria-hidden="true" /> Start
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
                <Calendar size={11} aria-hidden="true" /> End
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
          {dayCount !== null ? (
            <p className="text-xs text-muted inline-flex items-center gap-1 -mt-1 mb-3" style={{ fontVariantNumeric: 'tabular-nums' }}>
              <Calendar size={11} aria-hidden="true" /> {dayCount} day{dayCount === 1 ? '' : 's'} total
            </p>
          ) : null}

          <div className="form-group">
            <label htmlFor="notes" className="form-label inline-flex items-center gap-1">
              <FileText size={11} aria-hidden="true" /> Notes for your team
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
              {notesLeft} characters left
            </p>
          </div>
        </fieldset>

        {/* Collaborators */}
        <fieldset className="border border-border rounded-sm bg-[#FFFFFF] p-5">
          <legend className="px-2 text-[11px] uppercase tracking-wide text-muted inline-flex items-center gap-1">
            <UserPlus size={11} aria-hidden="true" /> Invite collaborators
            {emails.length > 0 ? (
              <span
                className="ml-2 text-muted normal-case tracking-normal"
                style={{ fontVariantNumeric: 'tabular-nums' }}
              >
                ({emails.length})
              </span>
            ) : null}
          </legend>
          <p className="text-sm text-muted mb-3">
            They will be able to edit this itinerary with you once they accept.
          </p>
          <div className="flex flex-wrap gap-2 mb-3">
            <div className="relative flex-1 min-w-[200px]">
              <Mail
                size={13}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none"
                aria-hidden="true"
              />
              <input
                type="email"
                placeholder="teammate@localit.dev"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ',') {
                    e.preventDefault()
                    addEmail()
                  } else if (e.key === 'Backspace' && newEmail === '' && emails.length > 0) {
                    setEmails(emails.slice(0, -1))
                  }
                }}
                onBlur={() => {
                  if (newEmail.trim()) addEmail()
                }}
                className="form-input pl-9"
                aria-label="Collaborator email"
              />
            </div>
            <button
              type="button"
              onClick={addEmail}
              disabled={!newEmail.trim()}
              className="inline-flex items-center gap-1 h-10 px-3 text-sm font-medium rounded-sm bg-transparent text-ink border border-border-strong hover:bg-paper disabled:opacity-50"
            >
              <Plus size={14} aria-hidden="true" /> Add
            </button>
          </div>
          {emails.length > 0 ? (
            <ul className="flex flex-wrap gap-2" role="list">
              {emails.map((e) => (
                <li key={e}>
                  <span className="inline-flex items-center gap-1 h-8 px-3 text-xs bg-paper border border-border text-ink">
                    <Mail size={11} aria-hidden="true" className="text-muted" />
                    {e}
                    <button
                      type="button"
                      onClick={() => removeEmail(e)}
                      aria-label={`Remove ${e}`}
                      className="ml-1 text-muted hover:text-danger"
                    >
                      <X size={11} aria-hidden="true" />
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-subtle italic">No collaborators invited yet. You can invite them later from the itinerary page.</p>
          )}
        </fieldset>

        {error ? (
          <div className="alert alert-error" role="alert">
            <AlertTriangle size={14} aria-hidden="true" />
            <span>{error}</span>
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-3 sticky bottom-0 -mx-4 sm:mx-0 px-4 sm:px-0 py-3 bg-paper border-t border-border sm:border-0 sm:bg-transparent sm:static">
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
                Create itinerary
              </>
            )}
          </button>
          <Link
            href="/dashboard"
            className="inline-flex items-center h-11 px-5 text-sm font-medium rounded-sm bg-transparent text-ink border border-border-strong hover:bg-paper"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  )
}