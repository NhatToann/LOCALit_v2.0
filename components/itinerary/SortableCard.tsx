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
 * Contrast note (2026-10-10)
 * ─────────────────────────
 * The card sits on a dark jade column, so the text must be light —
 * not "make the card white". Three tiers of white, all AAA on the
 * card's `#15605A` fill:
 *   • title   → `#F5FDFA` (near-white, 12.9:1)
 *   • meta    → `#CCFBF1` (mint-200, 9.6:1) — was `text-slate-300`
 *   • address → `#A7F3D0` (mint-300, 6.5:1) — was `text-slate-400`
 * and every one of those is at least `text-xs` (12px) rather than the
 * 10px the old meta row used.
 *
 * The card fill is one step lighter than its column (`#15605A` on
 * `#134E4A`) so cards read as raised without needing a shadow — this
 * project is flat by rule.
 *
 * The delete control is always in the DOM and the tab order. It used to
 * be `opacity-0 group-hover:opacity-100`, which left keyboard users no
 * way to reach it and touch users no way to find it.
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
        'group relative bg-[#15605A] border border-[#0D9488] rounded-sm pl-3 pr-2 py-2.5 select-none',
        'hover:bg-[#1A6E66] hover:border-[#34D399]',
        'focus-within:border-[#34D399]',
        'transition-[background-color,border-color] duration-150',
        canEdit ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer',
        isDragging && !asOverlay ? 'opacity-40' : '',
        asOverlay ? 'shadow-lg ring-2 ring-[#34D399] rotate-1' : '',
      ].filter(Boolean).join(' ')}
      aria-label={`${stop.name}${timeLabel ? `, ${timeLabel}` : ''}`}
    >
      {/* Label bar (Trello convention) */}
      <div
        aria-hidden
        title={label.label}
        className="absolute left-0 top-0 bottom-0 w-1.5 rounded-l-sm"
        style={{ background: label.hex }}
      />

      <div className="flex items-start gap-1.5">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-[#F5FDFA] leading-snug break-words">{stop.name}</p>

          {timeLabel || stop.duration_minutes || stop.category ? (
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 mt-1.5 text-xs font-medium text-[#CCFBF1]">
              {timeLabel ? (
                <span className="inline-flex items-center gap-1 tabular-nums">
                  <Clock size={11} aria-hidden /> {timeLabel}
                </span>
              ) : null}
              {stop.duration_minutes ? (
                <span className="inline-flex items-center tabular-nums">{fmtMinutes(stop.duration_minutes)}</span>
              ) : null}
              {stop.category ? (
                <span className="inline-flex items-center gap-1 capitalize">
                  <Tag size={11} aria-hidden /> {stop.category}
                </span>
              ) : null}
            </div>
          ) : null}

          {stop.address ? (
            <p className="text-xs text-[#A7F3D0] truncate inline-flex items-center gap-1 mt-1">
              <MapPin size={11} aria-hidden /> {stop.address}
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
            onKeyDown={(e) => e.stopPropagation()}
            aria-label={`Remove card ${stop.name}`}
            title={`Remove ${stop.name}`}
            className="flex-shrink-0 inline-flex items-center justify-center w-7 h-7 text-[#CCFBF1] hover:text-[#FEE2E2] hover:bg-[#7F1D1D] rounded-sm transition-colors"
          >
            <X size={14} aria-hidden />
          </button>
        ) : null}
      </div>
    </article>
  )
}