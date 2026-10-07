'use client'

import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import type { ItineraryStop } from '@/lib/types'
import { BUCKET_META, type ItineraryBucket } from '@/lib/itinerary/buckets'
import SortableStopCard from './SortableStopCard'

interface Props {
  bucket: ItineraryBucket
  stops: ItineraryStop[]
  canEdit: boolean
  onCardClick?: (stopId: string) => void
}

/**
 * BucketColumn — one of three (or four) vertical drop zones in the
 * Trello-style itinerary board. Renders the column body and exposes a
 * droppable area; the SortableContext inside handles intra-column
 * reorder, and the outer DndContext handles cross-column moves.
 */
export default function BucketColumn({ bucket, stops, canEdit, onCardClick }: Props) {
  const meta = BUCKET_META[bucket]
  const Icon = meta.icon

  const { setNodeRef, isOver } = useDroppable({
    id: `bucket:${bucket}`,
    data: { bucket },
  })

  const ids = stops.map((s) => s.id)

  return (
    <section
      aria-label={`${meta.label} bucket`}
      className="flex flex-col min-w-0"
    >
      <header className="flex items-center justify-between px-3 py-2 border-b border-border bg-paper rounded-t-sm">
        <h3 className={`inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide ${meta.tone}`}>
          <Icon size={12} aria-hidden="true" />
          {meta.label}
        </h3>
        <span
          className="badge badge-neutral text-[10px] tabular-nums"
          aria-live="polite"
          aria-label={`${stops.length} stops`}
        >
          {stops.length}
        </span>
      </header>
      <p className="px-3 py-1 text-[10px] text-subtle italic border-b border-border">
        {meta.hint}
      </p>
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <div
          ref={setNodeRef}
          data-bucket={bucket}
          className={[
            'flex-1 p-2 min-h-[140px] rounded-b-sm border border-t-0 border-border',
            'flex flex-col gap-2',
            isOver ? 'bg-paper border-dashed border-primary' : 'bg-surface',
          ].join(' ')}
        >
          {stops.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-xs text-subtle italic py-4 border border-dashed border-border rounded-sm">
              Drop stops here
            </div>
          ) : (
            stops.map((s) => (
              <SortableStopCard
                key={s.id}
                stop={s}
                canEdit={canEdit}
                onClick={onCardClick ? () => onCardClick(s.id) : undefined}
              />
            ))
          )}
        </div>
      </SortableContext>
    </section>
  )
}