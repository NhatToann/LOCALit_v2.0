'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { MapPin } from 'lucide-react'
import { Avatar } from '@/components/ui/Avatar'
import type { TravelHistoryItem as TravelHistoryItemType } from '@/lib/types'

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  } catch {
    return iso
  }
}

function formatDuration(minutes: number): string {
  if (minutes < 1) return '< 1 min'
  if (minutes < 60) return `${minutes} min`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m === 0 ? `${h} h` : `${h} h ${m} min`
}

export default function TravelHistory() {
  const [items, setItems] = useState<TravelHistoryItemType[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const res = await fetch('/api/focus/history')
        const json = await res.json()
        if (cancelled) return
        if (!res.ok) {
          setError(json.message ?? json.error ?? 'Could not load travel history.')
          return
        }
        setItems((json.items ?? []) as TravelHistoryItemType[])
      } catch (err) {
        if (!cancelled) setError((err as Error).message)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <section
      className="border border-focus-border rounded-sm bg-focus-surface p-5"
      aria-label="Travel history"
    >
      <header className="mb-4">
        <h2 className="text-base font-semibold text-focus-text">Travel history</h2>
        <p className="text-xs text-focus-muted">Past Focus sessions with buddies</p>
      </header>

      {error ? (
        <p className="text-sm text-danger" role="alert">
          {error}
        </p>
      ) : items === null ? (
        <p className="text-sm text-focus-muted">Loading…</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-focus-muted">
          No past trips yet. Start a Focus session to make your first one.
        </p>
      ) : (
        <ul className="divide-y divide-focus-border">
          {items.map((item) => (
            <li key={item.id} className="py-3 flex items-center gap-3">
              <Avatar
                name={item.partnerName}
                src={item.partnerAvatar ?? null}
                size="md"
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-focus-text truncate">
                  Focus with {item.partnerName}
                </p>
                <p className="text-xs text-focus-muted">
                  {formatDate(item.endedAt)} · {formatDuration(item.durationMinutes)}
                  {item.itineraryTitle ? ` · ${item.itineraryTitle}` : ''}
                </p>
              </div>
              {item.itineraryId ? (
                <Link
                  href={`/itinerary/${item.itineraryId}`}
                  className="text-xs text-focus-primary hover:text-focus-primary-dark inline-flex items-center gap-1"
                >
                  <MapPin size={12} aria-hidden="true" />
                  View itinerary
                </Link>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
