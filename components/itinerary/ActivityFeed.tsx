'use client'

import type { TripActivity } from '@/lib/types'
import { Avatar } from '@/components/ui/Avatar'
import { Pencil, MapPin, Calendar, Receipt, Backpack, Trash2 } from 'lucide-react'

interface Props {
  items: TripActivity[]
  meId: string | null
}

const VERB_LABEL: Record<string, { label: string; Icon: typeof Pencil }> = {
  edited_notes: { label: 'edited the plan', Icon: Pencil },
  added_stop: { label: 'added a stop', Icon: MapPin },
  removed_stop: { label: 'removed a stop', Icon: Trash2 },
  added_day: { label: 'added a day', Icon: Calendar },
  deleted_day: { label: 'deleted a day', Icon: Trash2 },
  renamed_day: { label: 'renamed a day', Icon: Pencil },
  added_booking: { label: 'added a booking', Icon: Receipt },
  added_expense: { label: 'logged an expense', Icon: Receipt },
  added_packing_item: { label: 'added a packing item', Icon: Backpack },
  packed_item: { label: 'checked off a packing item', Icon: Backpack },
  unpacked_item: { label: 'unchecked a packing item', Icon: Backpack },
}

function relTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const s = Math.floor(diff / 1000)
  if (s < 60) return `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d < 30) return `${d}d ago`
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export default function ActivityFeed({ items, meId }: Props) {
  if (items.length === 0) {
    return (
      <div className="p-6 text-center text-sm text-muted">
        No activity yet. When you or your buddy add stops, bookings, or packing items, they'll show up here.
      </div>
    )
  }
  return (
    <ul className="divide-y divide-border max-h-96 overflow-y-auto">
      {items.map((a) => {
        const v = VERB_LABEL[a.verb] ?? { label: a.verb, Icon: Pencil }
        const Icon = v.Icon
        const actorName = (a as any).actor?.full_name ?? 'Someone'
        const isMine = a.actor_id === meId
        const payload = a.payload as Record<string, unknown>
        const detail =
          a.verb === 'added_stop' && payload?.name ? ` “${payload.name}”` :
          a.verb === 'added_booking' && payload?.location ? ` at ${payload.location}` :
          a.verb === 'added_expense' && payload?.amount ? ` (${payload.amount})` :
          a.verb === 'edited_notes' && typeof payload?.length === 'number' ? ` (${payload.length} chars)` :
          ''
        return (
          <li key={a.id} className="flex items-start gap-3 px-4 py-2.5">
            <Avatar name={actorName} src={(a as any).actor?.avatar_url} size="sm" />
            <div className="flex-1 min-w-0">
              <p className="text-sm text-ink">
                <span className="font-medium">{isMine ? 'You' : actorName}</span>{' '}
                <span className="text-muted inline-flex items-center gap-1">
                  <Icon size={11} aria-hidden="true" className="text-muted" />
                  {v.label}
                  {detail}
                </span>
              </p>
              <p className="text-[11px] text-subtle">{relTime(a.created_at)}</p>
            </div>
          </li>
        )
      })}
    </ul>
  )
}
