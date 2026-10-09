'use client'

import { useEffect, useState } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { Plus, Check, X, Trash2, Loader2, Pencil, Clock, MapPin, MoreHorizontal } from 'lucide-react'
import type { ItineraryDay, ItineraryStop } from '@/lib/types'
import { fmtTime, fmtRange, sortStops } from '@/lib/itinerary/times'
import { toneFor, TONE_TOKENS } from '@/lib/itinerary/list-tone'
import SortableCard from './SortableCard'

/**
 * One column on the itinerary board. Renders the day title + optional
 * time window as a header (with a colored left accent), the list of
 * cards, and the inline "add card" composer. The list body (`<ol>`)
 * is registered as a dnd-kit droppable so cards can be dropped onto
 * an empty list or below the last card.
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

  // The list body itself is a droppable: drop on empty space or
  // below the last card to append. ID = list-drop:<dayId> so the
  // board's onDragEnd can resolve it the same way as a card drop.
  const { setNodeRef: setBodyRef, isOver: isBodyOver } = useDroppable({ id: `list-drop:${day.id}` })
  // The whole <section> is also a droppable, registered with the
  // raw dayId (no prefix). This guarantees that dropping anywhere
  // on a list — even between cards or into its footer — resolves
  // to that list. closestCorners prefers the body, but if the
  // mouse is over the header or the composer, this catches it.
  const { setNodeRef: setSectionRef, isOver: isSectionOver } = useDroppable({ id: day.id })

  // Reset local form when remote day changes.
  useEffect(() => {
    setTitle(day.title ?? '')
    setStartTime(day.start_time?.slice(0, 5) ?? '')
    setEndTime(day.end_time?.slice(0, 5) ?? '')
  }, [day.title, day.start_time, day.end_time])

  async function saveHeader() {
    if (!title.trim()) {
      setError('List title cannot be empty.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await onUpdateDay(day.id, {
        title: title.trim() || null,
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
    if (!window.confirm(`Delete list "${day.title ?? 'Untitled'}" and all its cards? This cannot be undone.`)) return
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

  return (
    <section
      ref={setSectionRef}
      aria-label={day.title ?? 'List'}
      data-list-id={day.id}
      data-tone={tone}
      className={[
        'flex flex-col w-72 max-w-full flex-shrink-0 rounded-md transition-shadow',
        // Dark board: each column is a slightly lighter slate so it
        // pops off the page background.
        'bg-[#1E293B]',
        isSectionOver ? 'ring-2 ring-primary ring-offset-1 ring-offset-[#0F172A]' : 'shadow-none',
      ].join(' ')}
      style={{ boxShadow: isSectionOver ? '0 0 0 1px rgba(255,107,53,0.5)' : 'none' }}
    >
      <header
        className={`flex items-center gap-2 px-2.5 py-2 rounded-t-md ${tokens.headerBgClass}`}
      >
        {editingHeader ? (
          <div className="w-full space-y-2">
            <input
              type="text"
              autoFocus
              maxLength={120}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="List title"
              className="w-full text-sm h-8 bg-[#0F172A] border border-slate-600 text-slate-100 placeholder-slate-500 rounded-sm px-2 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
            <div className="grid grid-cols-2 gap-2">
              <label className="text-[10px] text-slate-300 inline-flex items-center gap-1">
                <Clock size={10} aria-hidden /> Start
                <input
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="text-xs h-7 ml-auto bg-[#0F172A] border border-slate-600 text-slate-100 rounded-sm px-1.5 focus:border-primary focus:outline-none"
                />
              </label>
              <label className="text-[10px] text-slate-300 inline-flex items-center gap-1">
                <Clock size={10} aria-hidden /> End
                <input
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  className="text-xs h-7 ml-auto bg-[#0F172A] border border-slate-600 text-slate-100 rounded-sm px-1.5 focus:border-primary focus:outline-none"
                />
              </label>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={saveHeader}
                disabled={saving || !title.trim()}
                className="inline-flex items-center gap-1 h-7 px-2 text-xs font-medium rounded-sm bg-primary text-white border border-primary hover:bg-primary-hover disabled:opacity-50"
              >
                {saving ? <Loader2 size={11} className="animate-spin" aria-hidden /> : <Check size={11} aria-hidden />}
                Save
              </button>
              <button
                type="button"
                onClick={() => {
                  setEditingHeader(false)
                  setTitle(day.title ?? '')
                  setStartTime(day.start_time?.slice(0, 5) ?? '')
                  setEndTime(day.end_time?.slice(0, 5) ?? '')
                  setError(null)
                }}
                disabled={saving}
                className="inline-flex items-center gap-1 h-7 px-2 text-xs font-medium rounded-sm bg-transparent text-slate-200 border border-slate-600 hover:bg-[#0F172A]"
              >
                <X size={11} aria-hidden /> Cancel
              </button>
            </div>
            {error ? <p className="text-[10px] text-danger">{error}</p> : null}
          </div>
        ) : (
          <div className="flex items-start gap-2">
            <div className="flex-1 min-w-0">
              <h3 className={`text-[13px] font-semibold truncate ${tokens.titleClass}`}>
                {day.title || 'Untitled list'}
              </h3>
              <div className="flex items-center gap-1.5 text-[11px] opacity-90 tabular-nums mt-0.5">
                {day.date ? (
                  <span>{new Date(day.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                ) : null}
                {range ? (
                  <span className="inline-flex items-center gap-0.5">
                    <Clock size={9} aria-hidden /> {range}
                  </span>
                ) : null}
              </div>
            </div>
            {canEdit ? (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setMenuOpen((v) => !v)}
                  aria-label="List actions"
                  aria-expanded={menuOpen}
                  className="inline-flex items-center justify-center w-6 h-6 text-white/80 hover:text-white hover:bg-black/20 rounded-sm"
                >
                  <MoreHorizontal size={14} aria-hidden />
                </button>
                {menuOpen ? (
                  <div
                    role="menu"
                    className="absolute right-0 top-7 z-10 w-44 bg-[#0F172A] border border-slate-700 rounded-sm shadow-lg"
                    onMouseLeave={() => setMenuOpen(false)}
                  >
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setMenuOpen(false)
                        setEditingHeader(true)
                      }}
                      className="flex items-center gap-2 w-full px-3 py-2 text-xs text-slate-100 hover:bg-[#1E293B]"
                    >
                      <Pencil size={11} aria-hidden /> Edit list
                    </button>
                    {!isLast ? null : (
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setMenuOpen(false)
                          void handleDeleteDay()
                        }}
                        className="flex items-center gap-2 w-full px-3 py-2 text-xs text-red-300 hover:bg-red-900/30 border-t border-slate-700"
                      >
                        <Trash2 size={11} aria-hidden /> Delete list
                      </button>
                    )}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        )}
      </header>

      <SortableContext items={sorted.map((s) => s.id)} strategy={verticalListSortingStrategy}>
        <ol
          ref={setBodyRef}
          data-droppable-list={day.id}
          data-list-body={day.id}
          aria-label={`Cards in ${day.title ?? 'list'}`}
          className={[
            'flex-1 p-2 space-y-2 min-h-[100px] transition-colors rounded-b-md',
            isBodyOver ? 'bg-black/30 ring-1 ring-primary' : '',
          ].join(' ')}
        >
          {sorted.length === 0 ? (
            <li className="rounded-sm px-3 py-4 text-[11px] text-slate-400 text-center italic pointer-events-none">
              {canEdit ? 'Drop cards here or add one below' : 'No cards yet'}
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

      {canEdit ? (
        <div className="px-2 pb-2 pt-1.5">
          {composing ? (
            <div className="space-y-2">
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
                placeholder="Enter a title for this card…"
                className="w-full text-sm bg-[#0F172A] border border-slate-600 text-slate-100 placeholder-slate-500 rounded-sm p-2 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none"
              />
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={addCard}
                  disabled={saving || !draftName.trim()}
                  className="inline-flex items-center h-7 px-3 text-xs font-medium rounded-sm bg-primary text-white hover:bg-primary-hover disabled:opacity-50"
                >
                  {saving ? <Loader2 size={11} className="animate-spin" aria-hidden /> : 'Add card'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setComposing(false)
                    setDraftName('')
                  }}
                  disabled={saving}
                  className="inline-flex items-center justify-center w-7 h-7 text-slate-400 hover:text-white rounded-sm"
                  aria-label="Cancel add card"
                >
                  <X size={14} aria-hidden />
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setComposing(true)}
              className="inline-flex items-center gap-1.5 h-8 px-2 text-xs text-slate-300 hover:text-white hover:bg-[#334155] rounded-sm w-full justify-start transition-colors"
            >
              <Plus size={14} aria-hidden /> Add a card
            </button>
          )}
        </div>
      ) : null}
    </section>
  )
}
