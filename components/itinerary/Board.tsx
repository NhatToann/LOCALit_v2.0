'use client'

import { useState, useEffect, useTransition } from 'react'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCorners,
  type DragStartEvent,
  type DragEndEvent,
} from '@dnd-kit/core'
import { arrayMove, sortableKeyboardCoordinates } from '@dnd-kit/sortable'
import { Loader2, Plus, Check, X } from 'lucide-react'
import type { ItineraryDay, ItineraryStop } from '@/lib/types'
import { createClient } from '@/utils/supabase/auth'
import List from './List'
import SortableCard from './SortableCard'
import CardDrawer from './CardDrawer'
import { effectiveStart, sortStops } from '@/lib/itinerary/times'

/**
 * Board — Trello-style kanban for a single itinerary.
 *
 * Top-level state
 * ───────────────
 * `days` and `stops` are kept as plain state. The parent supplies the
 * initial values and the realtime merge callbacks.
 *
 * Drag-and-drop
 * ─────────────
 * The board uses @dnd-kit. Each list (day) is a droppable; each card
 * (stop) is both a draggable AND a droppable (so you can drop ONTO
 * a card to insert before/after it). Drop targets:
 *   • empty list body  →  drop at end of list
 *   • another card     →  drop before that card in the same list
 *   • another list     →  drop at end of that list
 *
 * Persistence
 * ───────────
 * On drop, we issue a single UPDATE on the moved stop to set
 * `day_id`, `start_time` (preserved from source), and a re-numbered
 * `stop_order` against the new list. A follow-up UPDATE re-packs
 * the source list's `stop_order` so future fetches are deterministic.
 */
export default function Board({
  itineraryId,
  days,
  stops,
  canEdit,
  onAddDay,
  onUpdateDay,
  onDeleteDay,
  onAddCard,
  onUpdateCard,
  onDeleteCard,
}: {
  itineraryId: string
  days: ItineraryDay[]
  stops: ItineraryStop[]
  canEdit: boolean
  onAddDay: (input: { title: string; date: string; start_time: string; end_time: string }) => Promise<ItineraryDay>
  onUpdateDay: (id: string, patch: Partial<ItineraryDay>) => Promise<void>
  onDeleteDay: (id: string) => Promise<void>
  onAddCard: (dayId: string, name: string) => Promise<void>
  onUpdateCard: (id: string, patch: Partial<ItineraryStop>) => Promise<void>
  onDeleteCard: (id: string) => Promise<void>
}) {
  const [activeCardId, setActiveCardId] = useState<string | null>(null)
  const [openCardId, setOpenCardId] = useState<string | null>(null)
  const [addingList, setAddingList] = useState(false)
  const [draftList, setDraftList] = useState({ title: '', date: '', start_time: '', end_time: '' })
  const [, startTransition] = useTransition()
  const [savingDrop, setSavingDrop] = useState(false)
  const [dropError, setDropError] = useState<string | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const activeCard = activeCardId ? stops.find((s) => s.id === activeCardId) ?? null : null
  const openCard = openCardId ? stops.find((s) => s.id === openCardId) ?? null : null

  function onDragStart(e: DragStartEvent) {
    setActiveCardId(String(e.active.id))
  }

  function onDragEnd(e: DragEndEvent) {
    setActiveCardId(null)
    const { active, over } = e
    if (!over) return
    const sourceStop = stops.find((s) => s.id === active.id)
    if (!sourceStop) return

    // Resolve target list and insertion index.
    const overId = String(over.id)
    let targetListId: string
    let targetIndex: number

    if (overId.startsWith('list-drop:')) {
      targetListId = overId.slice('list-drop:'.length)
      targetIndex = stops.filter((s) => s.day_id === targetListId).length
    } else {
      // Dropped on a card.
      const overStop = stops.find((s) => s.id === over.id)
      if (!overStop || !overStop.day_id) {
        // No target list — bail.
        return
      }
      targetListId = overStop.day_id
      const listStops = sortStops(stops.filter((s) => s.day_id === targetListId))
      const overIdx = listStops.findIndex((s) => s.id === over.id)
      targetIndex = overIdx === -1 ? listStops.length : overIdx
    }

    const sourceListId = sourceStop.day_id
    // No-op: dropped back to the same slot in the same list.
    if (sourceListId === targetListId) {
      const listStops = sortStops(stops.filter((s) => s.day_id === targetListId))
      const sourceIdx = listStops.findIndex((s) => s.id === active.id)
      if (sourceIdx === targetIndex || sourceIdx + 1 === targetIndex) return
    }

    setSavingDrop(true)
    setDropError(null)
    startTransition(async () => {
      try {
        const sb = createClient()
        const start = effectiveStart(sourceStop)
        // 1) Move the card into the new list (or reorder within the same).
        const { error: e1 } = await sb
          .from('itinerary_stops')
          .update({
            day_id: targetListId,
            start_time: start ?? null,
            stop_order: targetIndex,
          })
          .eq('id', sourceStop.id)
        if (e1) throw e1
        // 2) Re-pack stop_order in the target list.
        const { data: targetRows, error: e2 } = await sb
          .from('itinerary_stops')
          .select('id, start_time, planned_time, stop_order')
          .eq('day_id', targetListId)
        if (e2) throw e2
        const targetPacked = sortStops(targetRows ?? [])
        await Promise.all(
          targetPacked.map((row, idx) =>
            sb.from('itinerary_stops').update({ stop_order: idx }).eq('id', row.id).then(),
          ),
        )
        // 3) If cross-list, re-pack the source list (minus the moved card).
        if (sourceListId && sourceListId !== targetListId) {
          const { data: sourceRows, error: e3 } = await sb
            .from('itinerary_stops')
            .select('id, start_time, planned_time, stop_order')
            .eq('day_id', sourceListId)
          if (e3) throw e3
          const sourcePacked = sortStops(sourceRows ?? [])
          await Promise.all(
            sourcePacked.map((row, idx) =>
              sb.from('itinerary_stops').update({ stop_order: idx }).eq('id', row.id).then(),
            ),
          )
        }
      } catch (err) {
        setDropError((err as Error).message ?? 'Could not save the move.')
      } finally {
        setSavingDrop(false)
      }
    })
  }

  async function handleAddList() {
    if (!draftList.title.trim()) return
    setAddingList(true)
    try {
      await onAddDay({
        title: draftList.title.trim(),
        date: draftList.date,
        start_time: draftList.start_time,
        end_time: draftList.end_time,
      })
      setDraftList({ title: '', date: '', start_time: '', end_time: '' })
    } finally {
      setAddingList(false)
    }
  }

  // Suppress: if there's an open drawer, render it as a portal sibling.
  useEffect(() => {
    if (!openCard && !activeCard) return
    // no-op — the drawer is rendered inline.
  }, [openCard, activeCard])

  // Drop targets for the empty list body
  const listDroppableIds = days.map((d) => `list-drop:${d.id}`)

  return (
    <div className="relative">
      {savingDrop ? (
        <div
          className="absolute -top-2 right-2 z-10 inline-flex items-center gap-1 px-2 py-0.5 bg-paper border border-border rounded-sm text-[10px] text-muted"
          aria-live="polite"
          role="status"
        >
          <Loader2 size={10} className="animate-spin" aria-hidden /> Saving move…
        </div>
      ) : null}
      {dropError ? (
        <div className="mb-3 border border-danger bg-danger-bg text-danger rounded-sm px-3 py-2 text-xs" role="alert">
          {dropError}
        </div>
      ) : null}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragCancel={() => setActiveCardId(null)}
      >
        <div className="flex gap-3 overflow-x-auto pb-3" role="list" aria-label="Itinerary lists">
          {days.length === 0 ? (
            <div className="border border-dashed border-border rounded-sm bg-paper p-8 text-center w-full">
              <p className="text-sm font-medium text-ink mb-1">No lists yet</p>
              <p className="text-xs text-muted mb-3">Start by adding the first list — a morning, a day, or a custom window.</p>
              {canEdit ? (
                <button
                  type="button"
                  onClick={() => setAddingList(true)}
                  className="inline-flex items-center gap-1 h-9 px-3 text-sm font-medium rounded-sm bg-primary text-paper border border-primary hover:bg-primary-hover"
                >
                  <Plus size={14} aria-hidden /> Add first list
                </button>
              ) : null}
            </div>
          ) : (
            days.map((d) => {
              const listStops = stops.filter((s) => s.day_id === d.id)
              return (
                <div key={d.id} role="listitem" data-list-wrapper={d.id} className="flex-shrink-0">
                  <List
                    day={d}
                    stops={listStops}
                    canEdit={canEdit}
                    onAddCard={onAddCard}
                    onUpdateDay={onUpdateDay}
                    onDeleteDay={onDeleteDay}
                    onClickCard={(id) => setOpenCardId(id)}
                    onDeleteCard={onDeleteCard}
                    isLast={d.day_order === Math.max(...days.map((x) => x.day_order))}
                  />
                </div>
              )
            })
          )}

          {canEdit && days.length > 0 ? (
            <div className="flex-shrink-0 w-72" role="listitem">
              {addingList ? (
                <div className="bg-surface border border-border rounded-sm p-3 space-y-2">
                  <input
                    type="text"
                    autoFocus
                    maxLength={120}
                    value={draftList.title}
                    onChange={(e) => setDraftList({ ...draftList, title: e.target.value })}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        void handleAddList()
                      } else if (e.key === 'Escape') {
                        setAddingList(false)
                        setDraftList({ title: '', date: '', start_time: '', end_time: '' })
                      }
                    }}
                    placeholder="List title — e.g. Saturday morning"
                    className="form-input text-sm"
                  />
                  <div className="grid grid-cols-3 gap-2">
                    <input
                      type="date"
                      value={draftList.date}
                      onChange={(e) => setDraftList({ ...draftList, date: e.target.value })}
                      className="form-input text-xs"
                      aria-label="List date"
                    />
                    <input
                      type="time"
                      value={draftList.start_time}
                      onChange={(e) => setDraftList({ ...draftList, start_time: e.target.value })}
                      className="form-input text-xs"
                      aria-label="List start time"
                    />
                    <input
                      type="time"
                      value={draftList.end_time}
                      onChange={(e) => setDraftList({ ...draftList, end_time: e.target.value })}
                      className="form-input text-xs"
                      aria-label="List end time"
                    />
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={handleAddList}
                      disabled={!draftList.title.trim()}
                      className="inline-flex items-center gap-1 h-8 px-2 text-xs font-medium rounded-sm bg-primary text-paper border border-primary hover:bg-primary-hover disabled:opacity-50"
                    >
                      <Check size={12} aria-hidden /> Add list
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setAddingList(false)
                        setDraftList({ title: '', date: '', start_time: '', end_time: '' })
                      }}
                      className="inline-flex items-center justify-center w-8 h-8 text-muted hover:text-ink hover:bg-paper border border-border rounded-sm"
                      aria-label="Cancel add list"
                    >
                      <X size={12} aria-hidden />
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setAddingList(true)}
                  className="inline-flex items-center gap-1 h-9 px-3 text-sm font-medium text-muted hover:text-ink hover:bg-paper border border-dashed border-border rounded-sm w-full justify-center"
                >
                  <Plus size={14} aria-hidden /> Add another list
                </button>
              )}
            </div>
          ) : null}
        </div>

        <DragOverlay>
          {activeCard ? (
            <SortableCard stop={activeCard} canEdit={false} onClick={() => {}} asOverlay />
          ) : null}
        </DragOverlay>
      </DndContext>

      {/* Hidden markers so dnd-kit can register each empty list as a drop target via closestCorners. */}
      {days.map((d) => (
        <DropPad key={`pad-${d.id}`} id={`list-drop:${d.id}`} />
      ))}

      {openCard ? (
        <>
          <div
            className="fixed inset-0 bg-ink/30 z-40"
            onClick={() => setOpenCardId(null)}
            aria-hidden
          />
          <CardDrawer
            stop={openCard}
            canEdit={canEdit}
            onClose={() => setOpenCardId(null)}
            onSaved={async (patch) => {
              await onUpdateCard(openCard.id, patch)
              setOpenCardId(null)
            }}
            onDeleted={async (id) => {
              await onDeleteCard(id)
              setOpenCardId(null)
            }}
          />
        </>
      ) : null}
    </div>
  )
}

/**
 * Invisible <div> registered as a droppable for each list so that
 * dropping on the list body (not on a card) still resolves.
 * Rendered outside the visible flex container.
 */
function DropPad({ id }: { id: string }) {
  return (
    <div
      aria-hidden
      data-pad={id}
      className="hidden"
    />
  )
}
