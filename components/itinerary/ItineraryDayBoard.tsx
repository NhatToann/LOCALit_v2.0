'use client'

import { useCallback, useMemo, useState, useTransition } from 'react'
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
  DragOverlay,
} from '@dnd-kit/core'
import { arrayMove, sortableKeyboardCoordinates } from '@dnd-kit/sortable'
import { Loader2 } from 'lucide-react'
import { createClient } from '@/utils/supabase/auth'
import type { ItineraryStop, ItineraryBucket } from '@/lib/types'
import { BUCKET_ORDER, groupByBucket } from '@/lib/itinerary/buckets'
import BucketColumn from './BucketColumn'
import SortableStopCard from './SortableStopCard'
import { useStopsRealtime } from '@/hooks/useStopsRealtime'

interface Props {
  dayId: string
  initialStops: ItineraryStop[]
  canEdit: boolean
  meId: string
  onCardClick?: (stopId: string) => void
  onConflict?: (stopName: string) => void
}

/**
 * ItineraryDayBoard — Trello-style board for one itinerary day.
 *
 * Three vertical columns (Morning / Afternoon / Evening) with an
 * optional "Unscheduled" column when there are stops without a
 * planned_time. The user can drag cards between columns or reorder
 * them within a column.
 *
 * Persistence
 * ───────────
 * • Optimistic update of local state.
 * • Cross-column move: UPDATE day_bucket_override + stop_order.
 * • Intra-column reorder: UPDATE stop_order for each affected row.
 * • All writes include `updated_at = now()` so the realtime LWW
 *   reconciler can ignore our own echoes.
 *
 * Realtime
 * ────────
 * Subscribes to `itinerary_stops` rows whose `day_id` matches. When
 * another collaborator writes, we merge into local state if the row
 * isn't ours (or if it's ours and we somehow missed the echo).
 *
 * Conflicts
 * ─────────
 * If a remote UPDATE has `updated_at` newer than the local copy AND
 * the remote `updated_by` (when available) isn't us, we surface a
 * non-blocking toast via `onConflict` so the other collaborator's
 * change isn't silently overridden by a stale drag.
 */
export default function ItineraryDayBoard({
  dayId,
  initialStops,
  canEdit,
  meId,
  onCardClick,
  onConflict,
}: Props) {
  const [stops, setStops] = useState<ItineraryStop[]>(initialStops)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [, startTransition] = useTransition()
  const [savingCount, setSavingCount] = useState(0)

  // local "last seen updated_at" map for LWW dedup of own writes.
  const lastSeenRef = useState(() => new Map<string, string>())[0]

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  /** Apply a remote UPDATE/INSERT to local state. Returns true if applied, false if deduped. */
  const mergeRemote = useCallback(
    (row: ItineraryStop, event: 'INSERT' | 'UPDATE' | 'DELETE') => {
      if (event === 'DELETE') {
        setStops((prev) => prev.filter((s) => s.id !== row.id))
        return
      }
      setStops((prev) => {
        const idx = prev.findIndex((s) => s.id === row.id)
        if (idx === -1) {
          // INSERT — append sorted by stop_order
          const next = [...prev, row]
          next.sort((a, b) => (a.stop_order ?? 0) - (b.stop_order ?? 0))
          return next
        }
        // UPDATE — LWW dedup against our own writes.
        const local = prev[idx]
        const remoteTs = row.updated_at ?? ''
        const localTs = lastSeenRef.get(row.id) || local.updated_at || ''
        if (remoteTs && localTs && remoteTs < localTs) {
          // Stale echo. Skip.
          return prev
        }
        // Detect conflict: remote row's updated_at newer than local,
        // and local user isn't the writer (heuristic — writer_id is
        // not in this table; we accept best-effort conflict signal).
        if (
          onConflict &&
          remoteTs &&
          localTs &&
          remoteTs > localTs &&
          local.name === row.name && // same row
          (local.day_bucket_override ?? null) !== (row.day_bucket_override ?? null)
        ) {
          startTransition(() => onConflict(row.name))
        }
        const next = [...prev]
        next[idx] = row
        next.sort((a, b) => (a.stop_order ?? 0) - (b.stop_order ?? 0))
        return next
      })
    },
    [onConflict],
  )

  useStopsRealtime(dayId, mergeRemote)

  const buckets = useMemo(() => groupByBucket(stops), [stops])
  const activeStop = activeId ? stops.find((s) => s.id === activeId) : null

  function onDragStart(e: DragStartEvent) {
    setActiveId(String(e.active.id))
  }

  async function onDragEnd(e: DragEndEvent) {
    setActiveId(null)
    const { active, over } = e
    if (!over) return

    const sourceStop = stops.find((s) => s.id === active.id)
    if (!sourceStop) return

    const sourceBucket = groupBucket(sourceStop)

    // Resolve target bucket from the `over` element. It can be either
    // a stop id (dropped on another card) or `bucket:<name>` (dropped
    // on the empty column body).
    let targetBucket: ItineraryBucket
    let targetIndex: number
    const overIdStr = String(over.id)
    if (overIdStr.startsWith('bucket:')) {
      targetBucket = overIdStr.slice('bucket:'.length) as ItineraryBucket
      targetIndex = buckets[targetBucket].length
    } else {
      const overStop = stops.find((s) => s.id === over.id)
      if (!overStop) return
      targetBucket = groupBucket(overStop)
      const list = buckets[targetBucket]
      targetIndex = list.findIndex((s) => s.id === over.id)
      if (targetIndex === -1) targetIndex = list.length
    }

    // No-op: dropped in the same place.
    if (sourceBucket === targetBucket) {
      const list = buckets[targetBucket]
      const sourceIndex = list.findIndex((s) => s.id === active.id)
      if (sourceIndex === targetIndex) return
    }

    // ───── Optimistic local reorder ─────
    const prev = stops
    const reordered = moveBetweenBuckets(stops, sourceStop.id, sourceBucket, targetBucket, targetIndex)
    setStops(reordered)
    setSavingCount((c) => c + 1)

    // ───── Server PATCH ─────
    const now = new Date().toISOString()
    const sb = createClient()
    try {
      // 1) Update the moved stop's bucket + position.
      const { error: e1 } = await sb
        .from('itinerary_stops')
        .update({
          day_bucket_override: targetBucket,
          stop_order: targetIndex,
          updated_at: now,
        })
        .eq('id', active.id)
      if (e1) throw e1
      lastSeenRef.set(String(active.id), now)

      // 2) Re-pack stop_order within both source and target buckets
      //    so subsequent fetches come back deterministic.
      const targetList = reordered.filter((s) =>
        targetBucket === groupBucket(s),
      )
      await Promise.all(
        targetList.map((s, i) =>
          sb
            .from('itinerary_stops')
            .update({ stop_order: i, updated_at: now })
            .eq('id', s.id)
            .then(() => lastSeenRef.set(s.id, now)),
        ),
      )
      if (sourceBucket !== targetBucket) {
        const sourceList = reordered.filter((s) =>
          sourceBucket === groupBucket(s),
        )
        await Promise.all(
          sourceList.map((s, i) =>
            sb
              .from('itinerary_stops')
              .update({ stop_order: i, updated_at: now })
              .eq('id', s.id)
              .then(() => lastSeenRef.set(s.id, now)),
          ),
        )
      }
    } catch (err) {
      console.error('[ItineraryDayBoard] save failed:', err)
      setStops(prev) // revert
      // Note: toast is the consumer's responsibility via onConflict or own UI
    } finally {
      setSavingCount((c) => Math.max(0, c - 1))
    }
  }

  return (
    <div className="relative">
      {savingCount > 0 ? (
        <div
          className="absolute -top-2 right-2 inline-flex items-center gap-1 px-2 py-0.5 bg-paper border border-border rounded-sm text-[10px] text-muted"
          aria-live="polite"
          role="status"
        >
          <Loader2 size={10} className="animate-spin" aria-hidden="true" />
          Saving…
        </div>
      ) : null}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragCancel={() => setActiveId(null)}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {BUCKET_ORDER.map((b) => (
            <BucketColumn
              key={b}
              bucket={b}
              stops={buckets[b]}
              canEdit={canEdit}
              onCardClick={onCardClick}
            />
          ))}
        </div>
        <DragOverlay>
          {activeStop ? (
            <SortableStopCard stop={activeStop} canEdit={false} asOverlay />
          ) : null}
        </DragOverlay>
      </DndContext>
      {!canEdit ? (
        <p className="mt-3 text-xs text-subtle italic text-center">
          View-only — ask an editor to drag stops.
        </p>
      ) : null}
    </div>
  )
}

// ───────────────────── helpers ─────────────────────

function groupBucket(s: ItineraryStop): ItineraryBucket {
  if (s.day_bucket_override) return s.day_bucket_override
  const hour = s.planned_time ? parseInt(s.planned_time.slice(0, 2), 10) : NaN
  if (Number.isNaN(hour)) return 'unscheduled'
  if (hour < 12) return 'morning'
  if (hour < 18) return 'afternoon'
  return 'evening'
}

/** Reorder stops locally: move stop `activeId` from sourceBucket to targetBucket at targetIndex. */
function moveBetweenBuckets(
  list: ItineraryStop[],
  activeId: string,
  sourceBucket: ItineraryBucket,
  targetBucket: ItineraryBucket,
  targetIndex: number,
): ItineraryStop[] {
  // Remove from old list
  const moving = list.find((s) => s.id === activeId)
  if (!moving) return list
  const without = list.filter((s) => s.id !== activeId)

  // Re-group without the moving stop
  const buckets: Record<ItineraryBucket, ItineraryStop[]> = {
    morning: [],
    afternoon: [],
    evening: [],
    unscheduled: [],
  }
  for (const s of without) buckets[groupBucket(s)].push(s)

  if (sourceBucket === targetBucket) {
    const sourceList = buckets[sourceBucket]
    const fromIdx = sourceList.findIndex((s) => s.id === activeId)
    const toIdx = targetIndex > fromIdx ? targetIndex - 1 : targetIndex
    buckets[sourceBucket] = arrayMove(sourceList, fromIdx === -1 ? sourceList.length : fromIdx, toIdx)
  } else {
    buckets[sourceBucket] = arrayMove(buckets[sourceBucket], buckets[sourceBucket].length, buckets[sourceBucket].length)
    const targetList = buckets[targetBucket]
    const insertIdx = Math.min(targetIndex, targetList.length)
    buckets[targetBucket] = [
      ...targetList.slice(0, insertIdx),
      { ...moving, day_bucket_override: targetBucket === groupBucket(moving) ? null : targetBucket },
      ...targetList.slice(insertIdx),
    ]
  }

  // Re-pack stop_order per bucket and concatenate.
  const out: ItineraryStop[] = []
  for (const k of BUCKET_ORDER) {
    buckets[k].forEach((s, idx) => {
      out.push({ ...s, stop_order: idx })
    })
  }
  return out
}