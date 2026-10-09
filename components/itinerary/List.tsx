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
  const { setNodeRef, isOver } = useDroppable({ id: `list-drop:${day.id}` })

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
      aria-label={day.title ?? 'List'}
      data-list-id={day.id}
      data-tone={tone}
      className={[
        'flex flex-col w-72 max-w-full flex-shrink-0 bg-surface border border-border border-l-4 rounded-sm',
        tokens.borderClass,
      ].join(' ')}
    >
      <header className={`px-3 py-2 border-b border-border rounded-t-sm ${tokens.headerBgClass}`}>
        {editingHeader ? (
          <div className="space-y-2">
            <input
              type="text"
              autoFocus
              maxLength={120}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="List title"
              className="form-input text-sm h-8"
            />
            <div className="grid grid-cols-2 gap-2">
              <label className="text-[10px] text-muted inline-flex items-center gap-1">
                <Clock size={10} aria-hidden /> Start
                <input
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="form-input text-xs h-7 ml-auto"
                />
              </label>
              <label className="text-[10px] text-muted inline-flex items-center gap-1">
                <Clock size={10} aria-hidden /> End
                <input
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  className="form-input text-xs h-7 ml-auto"
                />
              </label>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={saveHeader}
                disabled={saving || !title.trim()}
                className="inline-flex items-center gap-1 h-7 px-2 text-xs font-medium rounded-sm bg-primary text-paper border border-primary hover:bg-primary-hover disabled:opacity-50"
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
                className="inline-flex items-center gap-1 h-7 px-2 text-xs font-medium rounded-sm bg-transparent text-ink border border-border-strong hover:bg-paper"
              >
                <X size={11} aria-hidden /> Cancel
              </button>
            </div>
            {error ? <p className="text-[10px] text-danger">{error}</p> : null}
          </div>
        ) : (
          <div className="flex items-start gap-2">
            <div className="flex-1 min-w-0">
              <h3 className={`text-sm font-semibold truncate flex items-center gap-1.5 ${tokens.titleClass}`}>
                <span
                  aria-hidden
                  className="inline-block w-2 h-2 rounded-sm flex-shrink-0"
                  style={{ background: tokens.border }}
                />
                {day.title || 'Untitled list'}
                {range ? (
                  <span className="text-[10px] text-muted font-normal tabular-nums whitespace-nowrap">
                    <Clock size={9} className="inline-block mr-0.5 align-middle" aria-hidden />
                    {range}
                  </span>
                ) : null}
              </h3>
              <p className="text-[10px] text-subtle tabular-nums mt-0.5">
                {day.date ? new Date(day.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'No date'}
                <span className="mx-1" aria-hidden>·</span>
                {sorted.length} card{sorted.length === 1 ? '' : 's'}
              </p>
            </div>
            {canEdit ? (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setMenuOpen((v) => !v)}
                  aria-label="List actions"
                  aria-expanded={menuOpen}
                  className="inline-flex items-center justify-center w-7 h-7 text-muted hover:text-ink hover:bg-paper border border-border rounded-sm"
                >
                  <MoreHorizontal size={14} aria-hidden />
                </button>
                {menuOpen ? (
                  <div
                    role="menu"
                    className="absolute right-0 top-8 z-10 w-44 bg-surface border border-border rounded-sm shadow-lg"
                    onMouseLeave={() => setMenuOpen(false)}
                  >
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setMenuOpen(false)
                        setEditingHeader(true)
                      }}
                      className="flex items-center gap-2 w-full px-3 py-2 text-xs text-ink hover:bg-paper"
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
                        className="flex items-center gap-2 w-full px-3 py-2 text-xs text-danger hover:bg-danger-bg border-t border-border"
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
          ref={setNodeRef}
          data-droppable-list={day.id}
          data-list-body={day.id}
          aria-label={`Cards in ${day.title ?? 'list'}`}
          className={[
            'flex-1 p-2 space-y-2 min-h-[100px] transition-colors rounded-sm',
            isOver ? 'bg-paper border border-dashed border-primary' : '',
          ].join(' ')}
        >
          {sorted.length === 0 ? (
            <li className="border border-dashed border-border rounded-sm px-3 py-4 text-[11px] text-subtle text-center italic pointer-events-none">
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
        <div className="px-2 pb-2 border-t border-border pt-2">
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
                placeholder="Card name — e.g. Marble Mountains"
                className="form-input text-sm"
              />
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={addCard}
                  disabled={saving || !draftName.trim()}
                  className="inline-flex items-center gap-1 h-7 px-2 text-xs font-medium rounded-sm bg-primary text-paper border border-primary hover:bg-primary-hover disabled:opacity-50"
                >
                  {saving ? <Loader2 size={11} className="animate-spin" aria-hidden /> : <Plus size={11} aria-hidden />}
                  Add card
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setComposing(false)
                    setDraftName('')
                  }}
                  disabled={saving}
                  className="inline-flex items-center justify-center w-7 h-7 text-muted hover:text-ink hover:bg-paper border border-border rounded-sm"
                  aria-label="Cancel add card"
                >
                  <X size={12} aria-hidden />
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setComposing(true)}
              className="inline-flex items-center gap-1 h-8 px-2 text-xs font-medium text-muted hover:text-ink hover:bg-paper rounded-sm w-full justify-start"
            >
              <Plus size={12} aria-hidden /> Add a card
            </button>
          )}
        </div>
      ) : null}
    </section>
  )
}
