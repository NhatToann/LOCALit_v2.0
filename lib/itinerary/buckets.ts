/**
 * Bucket resolution for itinerary stops.
 *
 * A "bucket" is one of three time-of-day windows: morning, afternoon,
 * evening — plus "unscheduled" for stops without a planned_time.
 *
 * Each stop has:
 *   - planned_time (HH:MM) — canonical scheduled hour
 *   - day_bucket_override (optional) — user's manual override from drag-drop
 *
 * The effective bucket shown in the UI is:
 *   override ?? deriveBucketFromTime(planned_time)
 *
 * planned_time stays unchanged when the user drags a stop between
 * buckets; only the override moves. That way, editing planned_time
 * still produces the natural bucket and the override only affects
 * visual order.
 */
import type { LucideIcon } from 'lucide-react'
import { Sun, Sunset, Moon, Clock } from 'lucide-react'

export type ItineraryBucket = 'morning' | 'afternoon' | 'evening' | 'unscheduled'

export const BUCKET_ORDER: readonly ItineraryBucket[] = [
  'morning',
  'afternoon',
  'evening',
  'unscheduled',
] as const

export interface BucketMeta {
  v: ItineraryBucket
  label: string
  icon: LucideIcon
  /** Tailwind token class for the column header accent. */
  tone: string
  /** Descriptive copy shown under the column header (one short line). */
  hint: string
}

export const BUCKET_META: Record<ItineraryBucket, BucketMeta> = {
  morning: {
    v: 'morning',
    label: 'Morning',
    icon: Sun,
    tone: 'text-warning',
    hint: '06:00 – 11:59',
  },
  afternoon: {
    v: 'afternoon',
    label: 'Afternoon',
    icon: Sunset,
    tone: 'text-primary',
    hint: '12:00 – 17:59',
  },
  evening: {
    v: 'evening',
    label: 'Evening',
    icon: Moon,
    tone: 'text-info',
    hint: '18:00 – 23:59',
  },
  unscheduled: {
    v: 'unscheduled',
    label: 'Unscheduled',
    icon: Clock,
    tone: 'text-muted',
    hint: 'No time set',
  },
}

/** Derive the auto-bucket from a HH:MM string. Returns 'unscheduled' when missing or unparseable. */
export function deriveBucketFromTime(time: string | null | undefined): ItineraryBucket {
  if (!time) return 'unscheduled'
  const hour = parseInt(time.slice(0, 2), 10)
  if (Number.isNaN(hour)) return 'unscheduled'
  if (hour < 12) return 'morning'
  if (hour < 18) return 'afternoon'
  return 'evening'
}

/** The bucket shown in the UI. */
export function effectiveBucket(s: {
  day_bucket_override?: ItineraryBucket | null
  planned_time?: string | null
}): ItineraryBucket {
  if (s.day_bucket_override) return s.day_bucket_override
  return deriveBucketFromTime(s.planned_time)
}

/** Group an array of stops by their effective bucket, preserving stop_order. */
export function groupByBucket<T extends {
  day_bucket_override?: ItineraryBucket | null
  planned_time?: string | null
  stop_order?: number | null
}>(stops: T[]): Record<ItineraryBucket, T[]> {
  const groups: Record<ItineraryBucket, T[]> = {
    morning: [],
    afternoon: [],
    evening: [],
    unscheduled: [],
  }
  for (const s of stops) {
    groups[effectiveBucket(s)].push(s)
  }
  // Each group is already in stop_order because the caller passes
  // a pre-sorted array — but we sort defensively in case it isn't.
  for (const k of BUCKET_ORDER) {
    groups[k].sort((a, b) => (a.stop_order ?? 0) - (b.stop_order ?? 0))
  }
  return groups
}

/** A short label for accessibility (e.g. "Marble Mountains, 09:30, Morning"). */
export function bucketAccentLabel(s: {
  name?: string | null
  planned_time?: string | null
  day_bucket_override?: ItineraryBucket | null
}): string {
  const bucket = effectiveBucket(s)
  const time = s.planned_time ? s.planned_time.slice(0, 5) : 'no time'
  return `${s.name ?? 'Unnamed stop'}, ${time}, ${BUCKET_META[bucket].label}`
}