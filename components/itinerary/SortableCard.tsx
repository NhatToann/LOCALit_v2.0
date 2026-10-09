'use client'

import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, Clock, MapPin, Tag, Trash2, X } from 'lucide-react'
import type { ItineraryStop } from '@/lib/types'
import { effectiveStart, fmtMinutes } from '@/lib/itinerary/times'

/**
 * One draggable card on the Trello-style board.
 *
 * Drag-vs-click: a 4px activation distance prevents drag hijacking
 * normal clicks. Clicking opens the card drawer.
 */
export default function SortableCard({
  stop,
  canEdit,
  onClick,
  onDelete,
  asOverlay = false,
}: {
  stop: ItineraryStop
  canEdit: boolean
  onClick: () => void
  onDelete?: () => void
  asOverlay?: boolean
}) {
  const sortable = useSortable({
    id: stop.id,
    data: { type: 'card', stopId: stop.id, dayId: stop.day_id },
    disabled: !canEdit || asOverlay,
  })
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = sortable

  const style: React.CSSProperties = asOverlay
    ? {}
    : { transform: CSS.Transform.toString(transform), transition }

  const start = effectiveStart(stop)
  const startLabel = start?.slice(0, 5) ?? ''
  const endLabel = stop.end_time?.slice(0, 5) ?? ''
  const timeLabel = endLabel && endLabel !== startLabel ? `${startLabel} – ${endLabel}` : startLabel

  return (
    <article
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={(e) => {
        if (isDragging) return
        e.preventDefault()
        onClick()
      }}
      className={[
        'group relative bg-surface border border-border rounded-sm p-2.5 select-none',
        canEdit ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer',
        isDragging && !asOverlay ? 'opacity-40' : '',
        asOverlay ? 'shadow-xl ring-2 ring-primary rotate-1' : '',
      ].filter(Boolean).join(' ')}
      aria-label={`${stop.name}${timeLabel ? `, ${timeLabel}` : ''}`}
    >
      <div className="flex items-start gap-1.5">
        {canEdit ? (
          <GripVertical
            size={12}
            className="text-subtle opacity-0 group-hover:opacity-100 transition-opacity mt-0.5 flex-shrink-0"
            aria-hidden
          />
        ) : null}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-ink leading-snug">{stop.name}</p>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-1 text-[10px] text-muted">
            {timeLabel ? (
              <span className="inline-flex items-center gap-0.5 tabular-nums">
                <Clock size={9} aria-hidden /> {timeLabel}
              </span>
            ) : null}
            {stop.duration_minutes ? (
              <span className="inline-flex items-center gap-0.5 tabular-nums">
                {fmtMinutes(stop.duration_minutes)}
              </span>
            ) : null}
            {stop.category ? (
              <span className="inline-flex items-center gap-0.5 capitalize">
                <Tag size={9} aria-hidden /> {stop.category}
              </span>
            ) : null}
          </div>
          {stop.address ? (
            <p className="text-[10px] text-muted truncate inline-flex items-center gap-0.5 mt-0.5">
              <MapPin size={9} aria-hidden /> {stop.address}
            </p>
          ) : null}
        </div>
        {canEdit && onDelete && !asOverlay ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onDelete()
            }}
            onPointerDown={(e) => e.stopPropagation()}
            aria-label={`Remove ${stop.name}`}
            className="opacity-0 group-hover:opacity-100 inline-flex items-center justify-center w-5 h-5 text-muted hover:text-danger hover:bg-danger-bg rounded-sm flex-shrink-0"
          >
            <X size={11} aria-hidden />
          </button>
        ) : null}
      </div>
    </article>
  )
}
