/**
 * Time helpers for the itinerary board.
 *
 * Why this file exists
 * ────────────────────
 * Each itinerary list (day) and each card (stop) can carry an optional
 * `start_time` / `end_time` window. The board needs to:
 *   • render times in HH:MM format consistently,
 *   • derive an effective time from either the new explicit columns
 *     or the legacy `planned_time` + `duration_minutes` pair, and
 *   • sort stops within a list by their effective start time.
 *
 * Keeping these helpers in one place lets the column header, the card
 * row, and the drawer all read the same data shape.
 */

export type TimeString = string | null | undefined

/** Format a `time` Postgres string ("HH:MM:SS" or "HH:MM") as "HH:MM". */
export function fmtTime(t: TimeString): string {
  if (!t) return ''
  const m = t.match(/^(\d{1,2}):(\d{2})/)
  if (!m) return ''
  return `${m[1].padStart(2, '0')}:${m[2]}`
}

/** "14:30" → minutes since 00:00. Returns null when unparseable. */
export function timeToMinutes(t: TimeString): number | null {
  if (!t) return null
  const [hh, mm] = fmtTime(t).split(':').map(Number)
  if (Number.isNaN(hh) || Number.isNaN(mm)) return null
  return hh * 60 + mm
}

/** Pick the best start time for a stop, in priority order. */
export function effectiveStart(s: {
  start_time?: TimeString
  planned_time?: TimeString
}): TimeString {
  return s.start_time ?? s.planned_time ?? null
}

/** Pick the best end time for a stop. Falls back to start+duration. */
export function effectiveEnd(s: {
  end_time?: TimeString
  start_time?: TimeString
  planned_time?: TimeString
  duration_minutes?: number | null
}): TimeString {
  if (s.end_time) return s.end_time
  const start = s.start_time ?? s.planned_time
  if (!start) return null
  if (!s.duration_minutes) return start
  const m = timeToMinutes(start)
  if (m === null) return start
  const end = m + s.duration_minutes
  return `${String(Math.floor(end / 60)).padStart(2, '0')}:${String(end % 60).padStart(2, '0')}`
}

/** Pick the best end time for a day-list (only the new explicit fields apply). */
export function effectiveListEnd(s: {
  end_time?: TimeString
  start_time?: TimeString
}): TimeString {
  return s.end_time ?? s.start_time ?? null
}

/** Sort stops within a list by their effective start time, with `null` last. */
export function sortStops<T extends {
  start_time?: TimeString
  planned_time?: TimeString
}>(stops: T[]): T[] {
  return [...stops].sort((a, b) => {
    const aKey = timeToMinutes(effectiveStart(a)) ?? Number.POSITIVE_INFINITY
    const bKey = timeToMinutes(effectiveStart(b)) ?? Number.POSITIVE_INFINITY
    return aKey - bKey
  })
}

/** "06:00 – 11:00" — short range label, returns '' when nothing to show. */
export function fmtRange(start?: TimeString, end?: TimeString): string {
  const s = fmtTime(start)
  const e = fmtTime(end)
  if (!s && !e) return ''
  if (s && e && s !== e) return `${s} – ${e}`
  return s || e
}

/** "1h 30m" — minute counter formatter. */
export function fmtMinutes(min: number | null | undefined): string {
  if (min == null || Number.isNaN(min)) return ''
  if (min < 60) return `${min}m`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}
