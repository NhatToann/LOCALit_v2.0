// Day buckets: morning | afternoon | evening, derived from planned_time.
// Used ONLY by the read-only PlanTab summary (Day-by-day section). The
// DaysTab editor no longer assigns buckets — stops carry a free time
// and PlanTab groups them by inspecting that time.

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
