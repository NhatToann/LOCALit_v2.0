'use client'

import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, MapPin, Clock } from 'lucide-react'
import type { ItineraryStop } from '@/lib/types'
import { effectiveBucket, BUCKET_META } from '@/lib/itinerary/buckets'

interface Props {
  stop: ItineraryStop
  canEdit: boolean
  /** When true, render as the drag-overlay preview (no listeners). */
  asOverlay?: boolean
  /** Optional click handler (open detail/edit sheet). */
  onClick?: () => void
}

/**
 * SortableStopCard — single draggable stop on the Trello board.
 *
 * The card is draggable only when `canEdit` is true. We attach
 * `useSortable` listeners to the whole card so the grip icon is a
 * visual cue, not the only draggable target.
 */
export default function SortableStopCard({ stop, canEdit, asOverlay = false, onClick }: Props) {
  const sortable = useSortable({
    id: stop.id,
    disabled: !canEdit || asOverlay,
    data: { bucket: effectiveBucket(stop), stopId: stop.id },
  })

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = sortable

  const style: React.CSSProperties = asOverlay
    ? {}
    : {
        transform: CSS.Transform.toString(transform),
        transition,
      }

  const bucket = effectiveBucket(stop)
  const meta = BUCKET_META[bucket]
  const BucketIcon = meta.icon

  const time = stop.planned_time ? stop.planned_time.slice(0, 5) : '—'

  return (
    <article
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={(e) => {
        // Click without drag = trigger onClick
        if (!isDragging && onClick) {
          e.preventDefault()
          onClick()
        }
      }}
      className={[
        'group bg-surface border border-border rounded-sm p-3 select-none',
        canEdit ? 'cursor-grab active:cursor-grabbing' : 'cursor-default',
        isDragging && !asOverlay ? 'opacity-30' : '',
        asOverlay ? 'shadow-lg ring-2 ring-primary rotate-1' : '',
      ].filter(Boolean).join(' ')}
      aria-label={`${stop.name}, ${time}, ${meta.label} bucket${canEdit ? ', drag to reorder' : ''}`}
    >
      <div className="flex items-start gap-2">
        {canEdit ? (
          <GripVertical
            size={14}
            className="text-subtle opacity-0 group-hover:opacity-100 transition-opacity duration-150 mt-0.5 shrink-0"
            aria-hidden="true"
          />
        ) : null}
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2">
            <span className="text-sm font-medium text-ink truncate flex-1 min-w-0">
              {stop.name}
            </span>
          </div>
          <div className="flex items-center gap-2 mt-1 text-[11px] text-muted">
            <span className={`inline-flex items-center gap-1 ${meta.tone}`} aria-hidden="true">
              <BucketIcon size={11} aria-hidden="true" />
              {time}
            </span>
            {stop.address ? (
              <span className="inline-flex items-center gap-0.5 truncate">
                <MapPin size={10} aria-hidden="true" />
                <span className="truncate">{stop.address}</span>
              </span>
            ) : null}
            {stop.duration_minutes ? (
              <span className="inline-flex items-center gap-0.5 whitespace-nowrap">
                <Clock size={10} aria-hidden="true" />
                {stop.duration_minutes}m
              </span>
            ) : null}
          </div>
        </div>
      </div>
    </article>
  )
}