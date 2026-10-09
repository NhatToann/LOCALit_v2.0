'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft,
  Mountain,
  UtensilsCrossed,
  Waves,
  Landmark,
  Moon,
  FilePlus,
  Loader2,
  Calendar,
  Check,
  Sparkles,
  Clock,
  Banknote,
  AlertTriangle,
  Users,
} from 'lucide-react'
import { TEMPLATES, type ItineraryTemplate } from '@/lib/itinerary/templates'
import { createClient } from '@/utils/supabase/auth'

/**
 * Template picker — the only way to create a new trip.
 *
 * Why templates, not a blank form
 * ──────────────────────────────
 * The Trello model only feels welcoming when the board already has
 * something on it. A blank form makes new users freeze; a template
 * they can edit/delete gives them a starting point.
 *
 * UX
 * ──
 * 1. The user picks a template from a flat grid of 6 cards.
 * 2. We expand a small panel: optional title + start date, then a
 *    "Use this template" CTA.
 * 3. On submit, we POST to /api/itinerary/from-template which copies
 *    the static template into the caller's schema and returns the
 *    new itinerary id. The client redirects to /itinerary/[id].
 *
 * "Blank" template is the only one that creates an empty board.
 */
const ICONS = {
  mountain: Mountain,
  beach: Waves,
  food: UtensilsCrossed,
  temple: Landmark,
  night: Moon,
  blank: FilePlus,
} as const

const COST_FMT = new Intl.NumberFormat('en-US')

export default function NewTripPage() {
  const router = useRouter()
  const [selected, setSelected] = useState<ItineraryTemplate>(TEMPLATES[0])
  const [title, setTitle] = useState('')
  const [startDate, setStartDate] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, startSubmitting] = useTransition()

  function selectTemplate(tpl: ItineraryTemplate) {
    setSelected(tpl)
    if (!title) setTitle(tpl.name)
    setError(null)
  }

  function submit() {
    setError(null)
    startSubmitting(async () => {
      const sb = createClient()
      const { data: { user } } = await sb.auth.getUser()
      if (!user) {
        setError('You must be signed in to create a trip.')
        return
      }
      const r = await fetch('/api/itinerary/from-template', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          templateId: selected.id,
          title: title.trim() || selected.name,
          startDate: startDate || undefined,
        }),
      })
      if (!r.ok) {
        const j = await r.json().catch(() => ({}))
        setError(j.error ?? 'Could not create trip.')
        return
      }
      const j = await r.json()
      router.push(`/itinerary/${j.itinerary.id}`)
    })
  }

  const Icon = ICONS[selected.icon]

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
        <h1 className="text-page-title mb-1">Pick a starting point</h1>
        <p className="text-sm text-muted max-w-xl">
          Choose a Da Nang itinerary curated by a local buddy, then edit the lists and cards on the board.
        </p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Template grid */}
        <section aria-label="Templates" className="lg:col-span-2">
          <h2 className="text-[11px] uppercase tracking-wide text-muted mb-3 inline-flex items-center gap-1">
            <Sparkles size={11} aria-hidden /> Templates
          </h2>
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {TEMPLATES.map((tpl) => {
              const I = ICONS[tpl.icon]
              const active = tpl.id === selected.id
              const cardCount = tpl.days.reduce((m, d) => m + d.cards.length, 0)
              return (
                <li key={tpl.id}>
                  <button
                    type="button"
                    onClick={() => selectTemplate(tpl)}
                    aria-pressed={active}
                    className={[
                      'w-full text-left p-4 border rounded-sm bg-surface transition-colors',
                      active
                        ? 'border-primary ring-1 ring-primary'
                        : 'border-border hover:border-border-strong',
                    ].join(' ')}
                  >
                    <div className="flex items-start gap-3">
                      <span
                        className={[
                          'inline-flex items-center justify-center w-9 h-9 rounded-sm flex-shrink-0',
                          active ? 'bg-primary text-paper' : 'bg-paper text-primary border border-border',
                        ].join(' ')}
                      >
                        <I size={18} aria-hidden />
                      </span>
                      <div className="flex-1 min-w-0">
                        <h3 className="text-sm font-semibold text-ink truncate">{tpl.name}</h3>
                        <p className="text-[10px] italic text-subtle" style={{ letterSpacing: '0.02em' }} aria-hidden>
                          {tpl.name_vi}
                        </p>
                        <p className="text-xs text-muted mt-1 line-clamp-2">{tpl.summary}</p>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-2 text-[10px] text-muted">
                          <span className="inline-flex items-center gap-0.5">
                            <Clock size={9} aria-hidden /> {tpl.duration_label}
                          </span>
                          {cardCount > 0 ? (
                            <span className="inline-flex items-center gap-0.5">
                              <Check size={9} aria-hidden /> {cardCount} card{cardCount === 1 ? '' : 's'} in {tpl.days.length} list{tpl.days.length === 1 ? '' : 's'}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-0.5">No preset cards</span>
                          )}
                          <span className="inline-flex items-center gap-0.5">
                            <Users size={9} aria-hidden /> {tpl.best_for}
                          </span>
                        </div>
                      </div>
                    </div>
                  </button>
                </li>
              )
            })}
          </ul>
        </section>

        {/* Selected detail + form */}
        <aside aria-label="Selected template" className="lg:sticky lg:top-6 self-start">
          <div className="border border-border rounded-sm bg-surface p-5">
            <div className="flex items-center gap-3 mb-3">
              <span className="inline-flex items-center justify-center w-10 h-10 rounded-sm bg-primary text-paper">
                <Icon size={20} aria-hidden />
              </span>
              <div className="min-w-0">
                <h2 className="text-sm font-semibold text-ink truncate">{selected.name}</h2>
                <p className="text-[10px] italic text-subtle" style={{ letterSpacing: '0.02em' }} aria-hidden>
                  {selected.name_vi}
                </p>
              </div>
            </div>
            <p className="text-sm text-ink leading-relaxed">{selected.summary}</p>

            <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
              <div className="border border-border rounded-sm p-2">
                <dt className="text-[10px] uppercase text-muted flex items-center justify-center gap-1">
                  <Clock size={9} aria-hidden /> Time
                </dt>
                <dd className="text-sm font-semibold tabular-nums mt-0.5">{selected.duration_label}</dd>
              </div>
              <div className="border border-border rounded-sm p-2">
                <dt className="text-[10px] uppercase text-muted flex items-center justify-center gap-1">
                  <Banknote size={9} aria-hidden /> Per person
                </dt>
                <dd className="text-sm font-semibold tabular-nums mt-0.5">
                  {selected.estimated_cost_vnd > 0
                    ? `${COST_FMT.format(selected.estimated_cost_vnd)}₫`
                    : '—'}
                </dd>
              </div>
              <div className="border border-border rounded-sm p-2">
                <dt className="text-[10px] uppercase text-muted flex items-center justify-center gap-1">
                  <Users size={9} aria-hidden /> Best for
                </dt>
                <dd className="text-xs font-semibold mt-0.5">{selected.best_for}</dd>
              </div>
            </dl>

            {selected.days.length > 0 ? (
              <div className="mt-4 pt-3 border-t border-border space-y-3">
                <h3 className="text-[11px] uppercase tracking-wide text-muted">
                  What's inside
                </h3>
                <ol className="space-y-2">
                  {selected.days.map((d, idx) => (
                    <li key={d.title} className="text-xs text-ink">
                      <p className="font-semibold">
                        <span className="text-muted mr-1 tabular-nums">{idx + 1}.</span>
                        {d.title}
                      </p>
                      <p className="text-[10px] text-muted tabular-nums">
                        {d.start_time} – {d.end_time} · {d.cards.length} card{d.cards.length === 1 ? '' : 's'}
                      </p>
                    </li>
                  ))}
                </ol>
              </div>
            ) : null}

            <form
              className="mt-4 pt-3 border-t border-border space-y-3"
              onSubmit={(e) => {
                e.preventDefault()
                submit()
              }}
            >
              <div>
                <label htmlFor="trip-title" className="form-label">Trip name</label>
                <input
                  id="trip-title"
                  type="text"
                  maxLength={200}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={selected.name}
                  className="form-input"
                />
              </div>
              <div>
                <label htmlFor="trip-start" className="form-label inline-flex items-center gap-1">
                  <Calendar size={11} aria-hidden /> Start date (optional)
                </label>
                <input
                  id="trip-start"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="form-input"
                />
                <p className="text-[10px] text-subtle mt-1">
                  Picks which day each list lands on. Leave blank to keep the template as a plan you can date later.
                </p>
              </div>

              {error ? (
                <div className="border border-danger bg-danger-bg text-danger rounded-sm px-3 py-2 text-xs flex items-center gap-1" role="alert">
                  <AlertTriangle size={12} aria-hidden />
                  <span>{error}</span>
                </div>
              ) : null}

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex items-center gap-1 h-10 px-4 text-sm font-medium rounded-sm bg-primary text-paper border border-primary hover:bg-primary-hover disabled:opacity-50"
                >
                  {submitting ? (
                    <>
                      <Loader2 size={14} className="animate-spin" aria-hidden /> Creating…
                    </>
                  ) : (
                    <>
                      <Check size={14} aria-hidden /> Use this template
                    </>
                  )}
                </button>
                <Link
                  href="/itinerary"
                  className="inline-flex items-center h-10 px-4 text-sm font-medium rounded-sm bg-transparent text-ink border border-border-strong hover:bg-paper"
                >
                  Cancel
                </Link>
              </div>
            </form>
          </div>
        </aside>
      </div>
    </main>
  )
}
