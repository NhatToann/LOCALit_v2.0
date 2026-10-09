'use client'

import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Clock, MapPin, Tag, X } from 'lucide-react'
import type { ItineraryStop } from '@/lib/types'
import { effectiveStart, fmtMinutes } from '@/lib/itinerary/times'
import { labelColorFor, LABEL_COLORS } from '@/lib/itinerary/list-tone'

/**
 * One draggable card on the Trello-style board.
 *
 * Trello card conventions we follow:
 *  • White surface, 8-12px padding, 4px corners, subtle 1px border
 *  • A small horizontal color label bar (Trello's "labels" feature)
 *  • A title row, then a meta row of icons (time, duration, category)
 *  • A delete X that appears on hover only
 *  • Cursor changes to grab on hover, grabbing while dragging
 *  • While dragging, the original card stays in place at 30% opacity
 *    and the DragOverlay shows a rotated + shadowed copy
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

  const labelKey = labelColorFor(stop)
  const label = LABEL_COLORS[labelKey]

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
        // Trello card: white, 4px radius, subtle border, single-line
        // shadow on hover. No left-border accent (that's for labels).
        'group relative bg-white border border-[#DFE1E6] rounded-sm p-2.5 select-none',
        'hover:shadow-[0_2px_4px_rgba(9,30,66,0.15)] hover:border-[#C1C7D0]',
        'transition-[box-shadow,border-color] duration-150',
        canEdit ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer',
        isDragging && !asOverlay ? 'opacity-30' : '',
        asOverlay ? 'shadow-2xl ring-2 ring-primary rotate-2' : '',
      ].filter(Boolean).join(' ')}
      aria-label={`${stop.name}${timeLabel ? `, ${timeLabel}` : ''}`}
    >
      {/* Label bar (Trello convention — small horizontal color stripe) */}
      <div
        aria-hidden
        title={label.label}
        className="absolute left-0 top-1.5 bottom-1.5 w-1 rounded-r-sm"
        style={{ background: label.hex }}
      />

      <div className="flex items-start gap-1.5 pl-2">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-[#172B4D] leading-snug">{stop.name}</p>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-1 text-[10px] text-[#5E6C84]">
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
            <p className="text-[10px] text-[#5E6C84] truncate inline-flex items-center gap-0.5 mt-0.5">
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
            className="opacity-0 group-hover:opacity-100 inline-flex items-center justify-center w-5 h-5 text-[#5E6C84] hover:text-[#172B4D] hover:bg-[#F4F5F7] rounded-sm flex-shrink-0"
          >
            <X size={11} aria-hidden />
          </button>
        ) : null}
      </div>
    </article>
  )
}
