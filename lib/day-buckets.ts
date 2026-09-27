// Day buckets: morning | afternoon | evening, derived from planned_time.
// Shared by DaysTab (editor) and PlanTab (summary) so the same row
// shows the same bucket in both views.

export type Bucket = 'morning' | 'afternoon' | 'evening'

export const BUCKETS: Bucket[] = ['morning', 'afternoon', 'evening']

export function bucketOf(time?: string | null): Bucket {
  if (!time) return 'morning'
  const h = parseInt(time.slice(0, 2), 10)
  if (Number.isNaN(h)) return 'morning'
  if (h < 12) return 'morning'
  if (h < 17) return 'afternoon'
  return 'evening'
}

// Default planned_time when adding a stop into a given bucket.
// Returns 'HH:MM:SS'.
export function defaultTimeForBucket(b: Bucket): string {
  switch (b) {
    case 'morning':
      return '09:00:00'
    case 'afternoon':
      return '13:00:00'
    case 'evening':
      return '18:30:00'
  }
}
