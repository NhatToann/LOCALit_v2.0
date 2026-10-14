'use client'

import { useEffect, useRef, useState } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { Plus, Check, X, Trash2, Loader2, Pencil, Clock, MoreHorizontal } from 'lucide-react'
import type { ItineraryDay, ItineraryStop } from '@/lib/types'
import { fmtRange, sortStops } from '@/lib/itinerary/times'
import { toneFor, TONE_TOKENS } from '@/lib/itinerary/list-tone'
import SortableCard from './SortableCard'

/**
 * One column on the itinerary board.
 *
 * Layout notes (2026-10-10 rewrite):
 * ─────────────────────────────────
 * The header used to be a single 11px row with a lone "…" button, which
 * made the list's own controls harder to find than the card's, and the
 * type was too small to read against the saturated header fill. The
 * header is now a two-row block: title + time on the left, then a
 * persistent row of Edit / Delete / More buttons on the right, all at
 * 32px so they line up with the cards below and with each other.
 *
 * Edit and Delete are direct buttons rather than items in the overflow
 * menu. They are the two things a user reaches for when a list is
 * wrong, and hiding them behind a second click was the reported
 * problem. Overflow keeps the secondary actions.
 *
 * `isLast` still suppresses Delete on the final list — a board needs at
 * least one column to drop a card onto.
 */
export default function List({
  day,
  stops,
  canEdit,
  onAddCard,
  onUpdateDay,
  onDeleteDay,
  onClickCard,
  onDeleteCard,
  isLast,
}: {
  day: ItineraryDay
  stops: ItineraryStop[]
  canEdit: boolean
  onAddCard: (dayId: string, name: string) => Promise<void>
  onUpdateDay: (dayId: string, patch: Partial<ItineraryDay>) => Promise<void>
  onDeleteDay: (dayId: string) => Promise<void>
  onClickCard: (stopId: string) => void
  onDeleteCard: (stopId: string) => Promise<void>
  isLast: boolean
}) {
  const [editingHeader, setEditingHeader] = useState(false)
  const [title, setTitle] = useState(day.title ?? '')
  const [startTime, setStartTime] = useState(day.start_time?.slice(0, 5) ?? '')
  const [endTime, setEndTime] = useState(day.end_time?.slice(0, 5) ?? '')
  const [composing, setComposing] = useState(false)
  const [draftName, setDraftName] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  // The list body is a droppable so cards can be appended to an empty
  // list or below the last one. ID = list-drop:<dayId> so the board's
  // onDragEnd resolves it the same way as a card drop.
  const { setNodeRef: setBodyRef, isOver: isBodyOver } = useDroppable({ id: `list-drop:${day.id}` })
  // The whole <section> is also a droppable registered with the raw
  // dayId, so a drop anywhere on the list — header, between cards,
  // footer — resolves to this list.
  const { setNodeRef: setSectionRef, isOver: isSectionOver } = useDroppable({ id: day.id })

  // Reset local form when the remote day changes.
  useEffect(() => {
    setTitle(day.title ?? '')
    setStartTime(day.start_time?.slice(0, 5) ?? '')
    setEndTime(day.end_time?.slice(0, 5) ?? '')
  }, [day.title, day.start_time, day.end_time])

  // Dismiss the overflow menu on outside click / Escape.
  useEffect(() => {
    if (!menuOpen) return
    function onDown(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setMenuOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [menuOpen])

  function resetHeaderForm() {
    setTitle(day.title ?? '')
    setStartTime(day.start_time?.slice(0, 5) ?? '')
    setEndTime(day.end_time?.slice(0, 5) ?? '')
    setError(null)
  }

  async function saveHeader() {
    if (!title.trim()) {
      setError('List title cannot be empty.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await onUpdateDay(day.id, {
        title: title.trim(),
        start_time: startTime || null,
        end_time: endTime || null,
      })
      setEditingHeader(false)
    } catch (e) {
      setError((e as Error).message ?? 'Could not save.')
    } finally {
      setSaving(false)
    }
  }

  async function addCard() {
    if (!draftName.trim()) return
    setSaving(true)
    setError(null)
    try {
      await onAddCard(day.id, draftName.trim())
      setDraftName('')
      setComposing(false)
    } catch (e) {
      setError((e as Error).message ?? 'Could not add card.')
    } finally {
      setSaving(false)
    }
  }

  async function handleDeleteDay() {
    const label = day.title?.trim() || 'Untitled list'
    const plural = stops.length === 1 ? 'card' : 'cards'
    if (!window.confirm(`Delete "${label}" and its ${stops.length} ${plural}? This cannot be undone.`)) return
    setSaving(true)
    try {
      await onDeleteDay(day.id)
    } catch (e) {
      setError((e as Error).message ?? 'Could not delete.')
      setSaving(false)
    }
  }

  const sorted = sortStops(stops)
  const range = fmtRange(day.start_time, day.end_time)
  const tone = toneFor(day)
  const tokens = TONE_TOKENS[tone]
  const cardCount = sorted.length

  return (
    <section
      ref={setSectionRef}
      aria-label={day.title ?? 'List'}
      data-list-id={day.id}
      data-tone={tone}
      className={[
        'flex flex-col w-[19rem] max-w-full flex-shrink-0 rounded-sm',
        'bg-[#134E4A] border border-[#0D9488]',
        isSectionOver ? 'border-[#34D399]' : '',
      ].filter(Boolean).join(' ')}
    >
      {/* ── Header: solid tone fill, title left, controls right ── */}
      <header className={`rounded-t-sm ${tokens.headerBgClass}`}>
        {editingHeader ? (
          <div className="px-3 py-3 space-y-2.5">
            <div>
              <label
                htmlFor={`title-${day.id}`}
                className={`block text-[11px] font-semibold uppercase tracking-wide mb-1 ${tokens.titleClass} opacity-80`}
              >
                List name
              </label>
              <input
                id={`title-${day.id}`}
                type="text"
                autoFocus
                maxLength={120}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    void saveHeader()
                  } else if (e.key === 'Escape') {
                    setEditingHeader(false)
                    resetHeaderForm()
                  }
                }}
                placeholder="e.g. Morning, Day 2, Hoi An"
                className="w-full text-sm h-9 bg-[#0A1F1D] text-[#F5FDFA] placeholder-[#6B8C86] rounded-sm px-2.5 border border-[#0D9488] focus:border-[#34D399] focus:outline-none focus:ring-2 focus:ring-[#34D399]/20"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label
                  htmlFor={`start-${day.id}`}
                  className={`block text-[11px] font-semibold uppercase tracking-wide mb-1 ${tokens.titleClass} opacity-80`}
                >
                  Start
                </label>
                <input
                  id={`start-${day.id}`}
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="w-full text-sm h-9 bg-[#0A1F1D] text-[#F5FDFA] rounded-sm px-2 border border-[#0D9488] focus:border-[#34D399] focus:outline-none"
                />
              </div>
              <div>
                <label
                  htmlFor={`end-${day.id}`}
                  className={`block text-[11px] font-semibold uppercase tracking-wide mb-1 ${tokens.titleClass} opacity-80`}
                >
                  End
                </label>
                <input
                  id={`end-${day.id}`}
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  className="w-full text-sm h-9 bg-[#0A1F1D] text-[#F5FDFA] rounded-sm px-2 border border-[#0D9488] focus:border-[#34D399] focus:outline-none"
                />
              </div>
            </div>

            {error ? <p className="text-[11px] text-danger">{error}</p> : null}

            <div className="flex items-center gap-1.5 pt-0.5">
              <button
                type="button"
                onClick={() => void saveHeader()}
                disabled={saving || !title.trim()}
                className="inline-flex items-center justify-center gap-1 h-8 px-3 text-xs font-semibold rounded-sm bg-[#34D399] text-[#0A1F1D] hover:bg-[#6EE7B7] disabled:opacity-50"
              >
                {saving ? <Loader2 size={13} className="animate-spin" aria-hidden /> : <Check size={13} aria-hidden />}
                Save
              </button>
              <button
                type="button"
                onClick={() => {
                  setEditingHeader(false)
                  resetHeaderForm()
                }}
                disabled={saving}
                className="inline-flex items-center justify-center gap-1 h-8 px-3 text-xs font-medium rounded-sm bg-[#0A1F1D] text-[#CCFBF1] border border-[#0D9488] hover:bg-[#0A3B37]"
              >
                <X size={13} aria-hidden /> Cancel
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Title row */}
            <div className="px-3 pt-2.5 pb-1.5">
              <div className="flex items-start justify-between gap-2">
                <h3 className={`text-[15px] font-bold leading-tight truncate flex-1 ${tokens.titleClass}`}>
                  {day.title || 'Untitled list'}
                </h3>
                <span
                  className={`flex-shrink-0 text-[11px] font-semibold tabular-nums px-1.5 py-0.5 rounded-sm ${tokens.titleClass} bg-black/15`}
                >
                  {cardCount} {cardCount === 1 ? 'card' : 'cards'}
                </span>
              </div>
              <div
                className={`flex items-center gap-1.5 text-xs font-medium mt-1 tabular-nums ${tokens.titleClass} opacity-90`}
              >
                {day.date ? (
                  <span>
                    {new Date(day.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </span>
                ) : null}
                {day.date && range ? <span aria-hidden>·</span> : null}
                {range ? (
                  <span className="inline-flex items-center gap-1">
                    <Clock size={11} aria-hidden /> {range}
                  </span>
                ) : null}
              </div>
            </div>

            {/* Controls row — Edit / Delete are direct, not behind "…" */}
            {canEdit ? (
              <div className="flex items-center gap-1 px-2 pb-2">
                <button
                  type="button"
                  onClick={() => setEditingHeader(true)}
                  aria-label={`Edit list ${day.title || 'Untitled list'}`}
                  className={`inline-flex items-center gap-1 h-8 px-2 text-xs font-semibold rounded-sm ${tokens.titleClass} hover:bg-black/20 transition-colors`}
                >
                  <Pencil size={13} aria-hidden /> Edit
                </button>

                <button
                  type="button"
                  onClick={() => void handleDeleteDay()}
                  disabled={isLast}
                  aria-label={
                    isLast
                      ? `Cannot delete ${day.title || 'Untitled list'} — the board needs one list`
                      : `Delete list ${day.title || 'Untitled list'}`
                  }
                  title={isLast ? 'A board needs at least one list' : 'Delete this list'}
                  className={`inline-flex items-center justify-center w-8 h-8 rounded-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                    isLast ? '' : 'text-red-200 hover:bg-red-900/40 hover:text-white'
                  } ${isLast ? tokens.titleClass : ''}`}
                >
                  <Trash2 size={14} aria-hidden />
                </button>

                <div ref={menuRef} className="relative ml-auto">
                  <button
                    type="button"
                    onClick={() => setMenuOpen((v) => !v)}
                    aria-label={`More actions for ${day.title || 'Untitled list'}`}
                    aria-expanded={menuOpen}
                    aria-haspopup="menu"
                    className={`inline-flex items-center justify-center w-8 h-8 rounded-sm ${tokens.titleClass} hover:bg-black/20 transition-colors`}
                  >
                    <MoreHorizontal size={15} aria-hidden />
                  </button>
                  {menuOpen ? (
                    <div
                      role="menu"
                      className="absolute right-0 top-9 z-30 w-52 bg-[#0A1F1D] border border-[#0D9488] rounded-sm p-1 shadow-lg"
                    >
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setMenuOpen(false)
                          setEditingHeader(true)
                        }}
                        className="flex items-center gap-2 w-full px-2.5 py-2 text-xs text-[#F5FDFA] rounded-sm hover:bg-[#134E4A] text-left"
                      >
                        <Pencil size={13} aria-hidden /> Edit list name & times
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setMenuOpen(false)
                          setComposing(true)
                        }}
                        className="flex items-center gap-2 w-full px-2.5 py-2 text-xs text-[#F5FDFA] rounded-sm hover:bg-[#134E4A] text-left"
                      >
                        <Plus size={13} aria-hidden /> Add a card
                      </button>
                      <div className="h-px bg-[#0D9488] my-1" role="separator" />
                      <button
                        type="button"
                        role="menuitem"
                        disabled={isLast}
                        onClick={() => {
                          setMenuOpen(false)
                          void handleDeleteDay()
                        }}
                        className="flex items-center gap-2 w-full px-2.5 py-2 text-xs text-[#FCA5A5] rounded-sm hover:bg-[#7F1D1D] text-left disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <Trash2 size={13} aria-hidden /> Delete list
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}
          </>
        )}
      </header>

      {/* ── Cards ── */}
      <SortableContext items={sorted.map((s) => s.id)} strategy={verticalListSortingStrategy}>
        <ol
          ref={setBodyRef}
          data-droppable-list={day.id}
          data-list-body={day.id}
          aria-label={`Cards in ${day.title ?? 'list'}`}
          className={[
            'flex-1 p-2 space-y-2 min-h-[6rem] bg-[#134E4A]',
            isBodyOver ? 'bg-[#0A3B37] ring-2 ring-inset ring-[#34D399]' : '',
          ].filter(Boolean).join(' ')}
        >
          {sorted.length === 0 ? (
            <li className="rounded-sm border border-dashed border-[#0D9488] px-3 py-6 text-xs text-[#A7F3D0] text-center italic pointer-events-none">
              {canEdit ? 'Drop cards here, or add one below' : 'No cards yet'}
            </li>
          ) : (
            sorted.map((s) => (
              <li key={s.id}>
                <SortableCard
                  stop={s}
                  canEdit={canEdit}
                  onClick={() => onClickCard(s.id)}
                  onDelete={canEdit ? () => onDeleteCard(s.id) : undefined}
                />
              </li>
            ))
          )}
        </ol>
      </SortableContext>

      {/* ── Composer ── */}
      {canEdit ? (
        <div className="px-2 pb-2 pt-1.5 border-t border-border">
          {composing ? (
            <div className="space-y-1.5 pt-1.5">
              <textarea
                autoFocus
                rows={2}
                maxLength={200}
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    void addCard()
                  } else if (e.key === 'Escape') {
                    setComposing(false)
                    setDraftName('')
                  }
                }}
                placeholder="What are you doing here?"
                aria-label={`New card in ${day.title || 'Untitled list'}`}
                className="w-full text-sm bg-[#0A1F1D] text-[#F5FDFA] placeholder-[#6B8C86] rounded-sm p-2 border border-[#0D9488] focus:border-[#34D399] focus:outline-none focus:ring-2 focus:ring-[#34D399]/20 resize-none"
              />
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => void addCard()}
                  disabled={saving || !draftName.trim()}
                  className="inline-flex items-center justify-center gap-1 h-8 px-3 text-xs font-semibold rounded-sm bg-[#34D399] text-[#0A1F1D] hover:bg-[#6EE7B7] disabled:opacity-50"
                >
                  {saving ? <Loader2 size={13} className="animate-spin" aria-hidden /> : null}
                  Add card
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setComposing(false)
                    setDraftName('')
                  }}
                  disabled={saving}
                  className="inline-flex items-center justify-center h-8 px-3 text-xs font-medium rounded-sm bg-[#0A1F1D] text-[#CCFBF1] border border-[#0D9488] hover:bg-[#0A3B37]"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setComposing(true)}
              className="inline-flex items-center gap-1.5 h-9 px-2 text-xs font-medium text-[#A7F3D0] hover:text-[#F5FDFA] rounded-sm w-full justify-start transition-colors hover:bg-[#0A3B37]"
            >
              <Plus size={14} aria-hidden /> Add a card
            </button>
          )}
          {error && !editingHeader ? <p className="text-[11px] text-[#FCA5A5] px-1 pt-1">{error}</p> : null}
        </div>
      ) : null}
    </section>
  )
}