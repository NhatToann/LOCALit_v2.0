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
  Tag,
  ArrowLeft,
} from 'lucide-react'
import { createClient } from '@/utils/supabase/auth'

const today = () => new Date().toISOString().slice(0, 10)

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default function NewItineraryPage() {
  const router = useRouter()
  const [form, setForm] = useState({
    title: '',
    startDate: '',
    endDate: '',
    notes: '',
  })
  const [collaboratorEmails, setCollaboratorEmails] = useState<string[]>([])
  const [newEmail, setNewEmail] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [isPending, startTransition] = useTransition()

  function addEmail() {
    const e = newEmail.trim().toLowerCase()
    if (!e) return
    if (!EMAIL_RE.test(e)) { setError('Invalid email format.'); return }
    if (collaboratorEmails.includes(e)) { setError('Already added.'); return }
    setCollaboratorEmails([...collaboratorEmails, e])
    setNewEmail('')
    setError('')
  }

  function removeEmail(e: string) {
    setCollaboratorEmails(collaboratorEmails.filter((x) => x !== e))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!form.title.trim()) { setError('Please enter a trip title.'); return }
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

    // 1. create itinerary
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

    // 2. invite collaborators (best-effort, in parallel)
    if (collaboratorEmails.length > 0) {
      startTransition(async () => {
        const { data: targets, error: lookupErr } = await supabase
          .from('profiles')
          .select('id, email')
          .in('email', collaboratorEmails)
        if (!lookupErr && targets && targets.length > 0) {
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

  return (
    <div className="container-page py-6 lg:py-8 space-y-4">
      <Link href="/dashboard" className="inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
        <ArrowLeft size={14} aria-hidden="true" /> Dashboard
      </Link>

      <section
        className="relative overflow-hidden border border-border rounded-sm bg-surface"
        aria-label="New itinerary header"
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
          <h1 className="text-page-title mb-2">Plan a new Da Nang trip</h1>
          <p className="text-sm text-muted max-w-xl">
            Sketch dates, notes, and invite collaborators. You can add stops and days after creating.
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
              <FileText size={11} aria-hidden="true" /> Notes for your team
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

        <fieldset className="border border-border rounded-sm bg-surface p-5">
          <legend className="px-2 text-[11px] uppercase tracking-wide text-muted">
            <UserPlus size={11} className="inline-block mr-1 align-middle" aria-hidden="true" />
            Invite collaborators
            {collaboratorEmails.length > 0 ? (
              <span
                className="ml-2 text-muted normal-case tracking-normal"
                style={{ fontVariantNumeric: 'tabular-nums' }}
              >
                ({collaboratorEmails.length})
              </span>
            ) : null}
          </legend>
          <p className="text-xs text-muted mb-3">
            Add people to edit this itinerary with you. They will receive an invite they can accept or decline.
          </p>
          <div className="flex flex-wrap gap-2 mb-3">
            <input
              type="email"
              placeholder="teammate@localit.dev"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ',') {
                  e.preventDefault()
                  addEmail()
                }
              }}
              className="form-input flex-1 min-w-[200px]"
              aria-label="Collaborator email"
            />
            <button
              type="button"
              onClick={addEmail}
              className="inline-flex items-center gap-1 h-10 px-3 text-sm font-medium rounded-sm bg-transparent text-ink border border-border-strong hover:bg-paper"
            >
              <Plus size={14} aria-hidden="true" /> Add
            </button>
          </div>
          {collaboratorEmails.length > 0 ? (
            <ul className="flex flex-wrap gap-2">
              {collaboratorEmails.map((e) => (
                <li key={e}>
                  <span className="inline-flex items-center gap-1 h-8 px-3 text-xs rounded-pill bg-paper border border-border text-ink">
                    <Mail size={11} aria-hidden="true" />
                    {e}
                    <button
                      type="button"
                      onClick={() => removeEmail(e)}
                      aria-label={`Remove ${e}`}
                      className="text-muted hover:text-danger"
                    >
                      <X size={11} aria-hidden="true" />
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-subtle italic">No collaborators invited yet. You can also invite them later from the itinerary page.</p>
          )}
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
            disabled={submitting || isPending}
            className="inline-flex items-center gap-2 h-11 px-5 text-sm font-medium rounded-sm bg-primary text-paper border border-primary hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting || isPending ? (
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
          <span className="text-[10px] text-subtle inline-flex items-center gap-1">
            <Tag size={10} aria-hidden="true" />
            You will be redirected to the editor after creating
          </span>
        </div>
      </form>
    </div>
  )
}
