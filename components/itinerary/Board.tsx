'use client'

import { useState, useTransition, useEffect } from 'react'
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
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable'
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
 * Each list (day) registers its `<ol>` body as a droppable via
 * useDroppable in `List.tsx` (id = `list-drop:<dayId>`). Each card
 * (stop) is both a draggable AND a droppable (so you can drop ONTO
 * a card to insert before/after it via closestCorners). Drop targets:
 *   • empty list body  →  drop at end of list
 *   • another card     →  drop before that card in the same list
 *   • another list body →  drop at end of that list
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

  // Local mirror of `stops`. The parent re-passes the canonical
  // stops on every realtime update; we sync that into local state
  // but ONLY when the canonical stops actually differ (so we don't
  // clobber an in-flight optimistic move with a stale prop). The
  // drag handler updates local state synchronously so the card
  // lands in the new list on the very next paint, with no waiting
  // on the DB or the realtime echo.
  const [localStops, setLocalStops] = useState<ItineraryStop[]>(stops)
  useEffect(() => {
    setLocalStops((prev) => {
      if (prev.length === stops.length) {
        let same = true
        for (let i = 0; i < prev.length; i += 1) {
          const a = prev[i]
          const b = stops[i]
          if (!b || a.id !== b.id || a.day_id !== b.day_id || a.stop_order !== b.stop_order) {
            same = false
            break
          }
        }
        if (same) return prev
      }
      return stops
    })
  }, [stops])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const activeCard = activeCardId ? localStops.find((s) => s.id === activeCardId) ?? null : null
  const openCard = openCardId ? localStops.find((s) => s.id === openCardId) ?? null : null

  function onDragStart(e: DragStartEvent) {
    setActiveCardId(String(e.active.id))
  }

  function onDragEnd(e: DragEndEvent) {
    setActiveCardId(null)
    const { active, over } = e
    if (!over) return
    const sourceStop = localStops.find((s) => s.id === active.id)
    if (!sourceStop) return

    // Resolve target list and insertion index.
    const overId = String(over.id)
    let targetListId: string
    let targetIndex: number

    if (overId.startsWith('list-drop:')) {
      // Dropped onto an empty list body.
      targetListId = overId.slice('list-drop:'.length)
      const listStops = sortStops(localStops.filter((s) => s.day_id === targetListId))
      targetIndex = listStops.length
    } else if (days.some((d) => d.id === overId)) {
      // Dropped onto a list's <section> (header or footer area).
      targetListId = overId
      const listStops = sortStops(localStops.filter((s) => s.day_id === targetListId))
      targetIndex = listStops.length
    } else {
      // Dropped on a card.
      const overStop = localStops.find((s) => s.id === over.id)
      if (!overStop || !overStop.day_id) {
        return
      }
      targetListId = overStop.day_id
      const listStops = sortStops(localStops.filter((s) => s.day_id === targetListId))
      const overIdx = listStops.findIndex((s) => s.id === over.id)
      // If dropping onto the same card, keep it where it is.
      if (overStop.id === sourceStop.id) {
        return
      }
      // If dropping from another list, place at the overIdx; from the
      // same list, the local state already arrayMove'd via dnd-kit's
      // own internal handling, so we just re-pack order here.
      targetIndex = overIdx === -1 ? listStops.length : overIdx
    }

    const sourceListId = sourceStop.day_id
    // No-op: dropped into the same list at the same index.
    if (sourceListId === targetListId) {
      const listStops = sortStops(localStops.filter((s) => s.day_id === targetListId))
      const sourceIdx = listStops.findIndex((s) => s.id === active.id)
      if (sourceIdx === targetIndex || sourceIdx + 1 === targetIndex) return
    }

    // 1) OPTIMISTIC: patch the LOCAL stops mirror so the card lands
    //    in the destination list on the very next paint. The DB write
    //    below is the source of truth; the realtime echo (which
    //    carries the same id) is idempotent — the useEffect above
    //    detects "local === prop" and skips the clobber.
    setLocalStops((prev) => {
      const moving = prev.find((s) => s.id === sourceStop.id)
      if (!moving) return prev
      const targetOthers = sortStops(prev.filter((s) => s.day_id === targetListId && s.id !== sourceStop.id))
      const clampedIndex = Math.max(0, Math.min(targetIndex, targetOthers.length))
      const newTarget = [
        ...targetOthers.slice(0, clampedIndex),
        { ...moving, day_id: targetListId },
        ...targetOthers.slice(clampedIndex),
      ].map((s, idx) => ({ ...s, stop_order: idx }))

      if (sourceListId && sourceListId !== targetListId) {
        const sourceOthers = sortStops(prev.filter((s) => s.day_id === sourceListId && s.id !== sourceStop.id)).map(
          (s, idx) => ({ ...s, stop_order: idx }),
        )
        const untouched = prev.filter((s) => s.day_id !== targetListId && s.day_id !== sourceListId)
        return [...untouched, ...sourceOthers, ...newTarget]
      }
      const untouched = prev.filter((s) => s.day_id !== targetListId)
      return [...untouched, ...newTarget]
    })

    setSavingDrop(true)
    setDropError(null)
    startTransition(async () => {
      try {
        const sb = createClient()
        const start = effectiveStart(sourceStop)
        // 2) Move the card into the new list (or reorder within the same).
        const { error: e1 } = await sb
          .from('itinerary_stops')
          .update({
            day_id: targetListId,
            start_time: start ?? null,
            stop_order: targetIndex,
          })
          .eq('id', sourceStop.id)
        if (e1) throw e1
        // 3) Re-pack stop_order in the target list.
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
        // 4) If cross-list, re-pack the source list (minus the moved card).
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
        <div className="flex gap-3 overflow-x-auto pb-3 items-start" role="list" aria-label="Itinerary lists">
          {days.length === 0 ? (
            <div className="border border-dashed border-border rounded-sm bg-paper p-8 text-center w-full">
              <p className="text-sm font-medium text-ink mb-1">No lists yet</p>
              <p className="text-xs text-muted mb-3">Start by adding the first list — a morning, a day, or a custom window.</p>
              {canEdit ? (
                addingList ? (
                  <AddListForm
                    draft={draftList}
                    setDraft={setDraftList}
                    onSubmit={handleAddList}
                    onCancel={() => {
                      setAddingList(false)
                      setDraftList({ title: '', date: '', start_time: '', end_time: '' })
                    }}
                    size="empty"
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => setAddingList(true)}
                    className="inline-flex items-center gap-1 h-9 px-3 text-sm font-medium rounded-sm bg-primary text-paper border border-primary hover:bg-primary-hover"
                  >
                    <Plus size={14} aria-hidden /> Add first list
                  </button>
                )
              ) : null}
            </div>
          ) : (
            days.map((d) => {
              const listStops = localStops.filter((s) => s.day_id === d.id)
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
                <AddListForm
                  draft={draftList}
                  setDraft={setDraftList}
                  onSubmit={handleAddList}
                  onCancel={() => {
                    setAddingList(false)
                    setDraftList({ title: '', date: '', start_time: '', end_time: '' })
                  }}
                  size="inline"
                />
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

/** Inline composer for adding a new list — used both in the empty state and inline. */
function AddListForm({
  draft,
  setDraft,
  onSubmit,
  onCancel,
  size,
}: {
  draft: { title: string; date: string; start_time: string; end_time: string }
  setDraft: (d: { title: string; date: string; start_time: string; end_time: string }) => void
  onSubmit: () => Promise<void>
  onCancel: () => void
  size: 'empty' | 'inline'
}) {
  const [busy, setBusy] = useState(false)
  async function handle() {
    if (!draft.title.trim()) return
    setBusy(true)
    try {
      await onSubmit()
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className={size === 'empty' ? 'max-w-md mx-auto bg-surface border border-border rounded-sm p-3 text-left space-y-2' : 'bg-surface border border-border rounded-sm p-3 space-y-2'}>
      <input
        type="text"
        autoFocus
        maxLength={120}
        value={draft.title}
        onChange={(e) => setDraft({ ...draft, title: e.target.value })}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            void handle()
          } else if (e.key === 'Escape') {
            onCancel()
          }
        }}
        placeholder="List title — e.g. Saturday morning"
        className="form-input text-sm"
      />
      <div className="grid grid-cols-3 gap-2">
        <input
          type="date"
          value={draft.date}
          onChange={(e) => setDraft({ ...draft, date: e.target.value })}
          className="form-input text-xs"
          aria-label="List date"
        />
        <input
          type="time"
          value={draft.start_time}
          onChange={(e) => setDraft({ ...draft, start_time: e.target.value })}
          className="form-input text-xs"
          aria-label="List start time"
        />
        <input
          type="time"
          value={draft.end_time}
          onChange={(e) => setDraft({ ...draft, end_time: e.target.value })}
          className="form-input text-xs"
          aria-label="List end time"
        />
      </div>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={handle}
          disabled={busy || !draft.title.trim()}
          className="inline-flex items-center gap-1 h-8 px-2 text-xs font-medium rounded-sm bg-primary text-paper border border-primary hover:bg-primary-hover disabled:opacity-50"
        >
          {busy ? <Loader2 size={12} className="animate-spin" aria-hidden /> : <Check size={12} aria-hidden />}
          Add list
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex items-center justify-center w-8 h-8 text-muted hover:text-ink hover:bg-paper border border-border rounded-sm"
          aria-label="Cancel add list"
        >
          <X size={12} aria-hidden />
        </button>
      </div>
    </div>
  )
}
