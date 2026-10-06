'use client'

import { AlertTriangle, Clock } from 'lucide-react'
import { Avatar } from '@/components/ui/Avatar'
import { daysUntilExpiry, expiryLabel } from '@/lib/connection-stages'
import type { Connection } from '@/lib/types'

export interface ItineraryHeroPerson {
  id: string
  full_name: string
  avatar_url: string | null
  role: 'lead' | 'companion' | 'co-buddy'
}

interface Props {
  title: string | null
  connection: Connection
  travelers: ItineraryHeroPerson[]
  coBuddies: ItineraryHeroPerson[]
  touristName: string
  buddyName: string
  canEdit: boolean
}

export default function ItineraryHero({
  title,
  connection,
  travelers,
  coBuddies,
  touristName,
  buddyName,
  canEdit,
}: Props) {
  const daysLeft = connection.status === 'accepted' ? daysUntilExpiry(connection.updated_at) : null
  const hasGroup = travelers.length > 1 || coBuddies.length > 1
  const personKey = (p: ItineraryHeroPerson) => `${p.role}-${p.id}`
  const countStyle = {
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
    fontVariantNumeric: 'tabular-nums' as const,
  }

  return (
    <section className="relative overflow-hidden border border-border rounded-sm bg-surface">
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{
          backgroundImage:
            "url('https://images.unsplash.com/photo-1602002418082-a4443e081dd1?w=1600&q=70&auto=format&fit=crop')",
          opacity: 0.18,
        }}
        aria-hidden="true"
      />
      <div
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(90deg, color-mix(in srgb, var(--color-paper) 95%, transparent) 0%, color-mix(in srgb, var(--color-paper) 70%, transparent) 100%)',
        }}
        aria-hidden="true"
      />
      <div className="relative p-6 lg:p-8">
        <p className="text-eyebrow text-primary mb-2">
          Shared itinerary
          <span
            className="ml-2 italic text-muted"
            style={{ letterSpacing: '0.02em' }}
            aria-hidden="true"
          >
            lịch trình chung
          </span>
        </p>
        <h1 className="text-page-title mb-2">{title ?? 'Da Nang itinerary'}</h1>
        <p className="text-sm text-muted mb-4 max-w-xl">
          {hasGroup
            ? `This trip has ${travelers.length} traveler${travelers.length === 1 ? '' : 's'} and ${coBuddies.length} guide${coBuddies.length === 1 ? '' : 's'}. All accepted participants can read; leads can edit.`
            : `Both ${touristName} and ${buddyName} can edit this page. Changes save automatically.`}
        </p>

        <div className="flex flex-wrap items-center gap-3 mb-3">
          <span className="badge badge-primary text-xs">
            Travelers (<span style={countStyle}>{travelers.length}</span>)
          </span>
          <ul className="flex flex-wrap items-center gap-2">
            {travelers.length === 0 ? (
              <li className="text-xs text-muted">No travelers yet.</li>
            ) : (
              travelers.map((t) => (
                <li
                  key={personKey(t)}
                  className="flex items-center gap-2 border border-border rounded-sm pl-1 pr-3 py-1 bg-paper"
                >
                  <Avatar name={t.full_name} src={t.avatar_url} size="xs" />
                  <span className="text-xs font-medium text-ink truncate max-w-[120px]">
                    {t.full_name}
                  </span>
                  {t.role === 'lead' ? (
                    <span className="badge badge-warning text-[10px]">Lead</span>
                  ) : null}
                </li>
              ))
            )}
          </ul>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <span className="badge badge-success text-xs">
            Buddies (<span style={countStyle}>{coBuddies.length}</span>)
          </span>
          <ul className="flex flex-wrap items-center gap-2">
            {coBuddies.length === 0 ? (
              <li className="text-xs text-muted">No buddies yet.</li>
            ) : (
              coBuddies.map((b) => (
                <li
                  key={personKey(b)}
                  className="flex items-center gap-2 border border-border rounded-sm pl-1 pr-3 py-1 bg-paper"
                >
                  <Avatar name={b.full_name} src={b.avatar_url} size="xs" />
                  <span className="text-xs font-medium text-ink truncate max-w-[120px]">
                    {b.full_name}
                  </span>
                  {b.role === 'lead' ? (
                    <span className="badge badge-warning text-[10px]">Lead</span>
                  ) : null}
                </li>
              ))
            )}
          </ul>
        </div>

        <div className="flex flex-wrap items-center gap-3 mt-4">
          <span className="hidden sm:inline text-subtle">·</span>
          <span
            className={`badge badge-${
              connection.status === 'accepted'
                ? 'success'
                : connection.status === 'declined'
                  ? 'danger'
                  : 'warning'
            }`}
          >
            {connection.status}
          </span>
          {daysLeft !== null ? (
            <span className="text-xs text-muted inline-flex items-center gap-1">
              <Clock size={12} aria-hidden="true" />
              {expiryLabel(daysLeft)}
            </span>
          ) : null}
        </div>

        {!canEdit ? (
          <div className="alert alert-warning mt-4" role="alert">
            <AlertTriangle size={16} aria-hidden="true" />
            <span>
              Editing unlocks once the buddy accepts the connection. You can still read the plan.
            </span>
          </div>
        ) : null}
      </div>
    </section>
  )
}
