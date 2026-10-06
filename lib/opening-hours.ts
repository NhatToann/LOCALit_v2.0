/**
 * Tiny OSM `opening_hours` parser. Handles the common 24/7 + simple
 * `Mo-Fr 09:00-17:00; Sa 09:00-12:00; Su off` shapes. Anything not
 * matched returns "unknown" — we never throw, the UI shows "Hours
 * unknown" gracefully.
 *
 * Not a full spec implementation (no PH, no `week 1-53`, no holidays).
 * Adequate for the most common Da Nang venues.
 */

export interface OpeningHoursCheck {
  open: boolean | 'unknown'
  reason: string
}

interface Rule {
  days: number[] // 0 = Sunday
  fromMin: number
  toMin: number
}

const DAY_MAP: Record<string, number> = {
  Su: 0, Mo: 1, Tu: 2, We: 3, Th: 4, Fr: 5, Sa: 6,
}

function parseDayRange(s: string): number[] {
  // "Mo-Fr" → [1,2,3,4,5]
  if (s.includes('-')) {
    const [a, b] = s.split('-')
    const start = DAY_MAP[a]
    const end = DAY_MAP[b]
    if (start == null || end == null) return []
    const out: number[] = []
    let i = start
    while (true) {
      out.push(i)
      if (i === end) break
      i = (i + 1) % 7
    }
    return out
  }
  if (DAY_MAP[s] != null) return [DAY_MAP[s]]
  return s.split(',').flatMap((p) => (DAY_MAP[p] != null ? [DAY_MAP[p]] : []))
}

function parseTime(s: string): number | null {
  // "09:00" → 540 minutes since midnight
  const m = /^(\d{1,2}):(\d{2})$/.exec(s)
  if (!m) return null
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10)
}

function parseRule(rule: string): Rule | null {
  // "Mo-Fr 09:00-17:00"
  const parts = rule.trim().split(/\s+/)
  if (parts.length < 2) return null
  const days = parseDayRange(parts[0])
  if (days.length === 0) return null
  const timeRange = parts[1]
  if (timeRange === 'off') return null
  const [from, to] = timeRange.split('-')
  const fromMin = parseTime(from)
  const toMin = parseTime(to)
  if (fromMin == null || toMin == null) return null
  return { days, fromMin, toMin }
}

export function parseOpeningHours(s: string | null | undefined): Rule[] {
  if (!s) return []
  if (s.trim().toLowerCase() === '24/7') {
    return [{ days: [0, 1, 2, 3, 4, 5, 6], fromMin: 0, toMin: 24 * 60 }]
  }
  return s
    .split(';')
    .map((r) => r.trim())
    .filter(Boolean)
    .map(parseRule)
    .filter((r): r is Rule => r !== null)
}

export function checkOpeningAt(
  openingHours: string | null | undefined,
  at: Date = new Date()
): OpeningHoursCheck {
  const rules = parseOpeningHours(openingHours)
  if (rules.length === 0) return { open: 'unknown', reason: 'Hours unknown' }
  const day = at.getDay()
  const minutes = at.getHours() * 60 + at.getMinutes()
  for (const r of rules) {
    if (r.days.includes(day) && minutes >= r.fromMin && minutes < r.toMin) {
      return { open: true, reason: `Open until ${formatTime(r.toMin)}` }
    }
  }
  return { open: false, reason: 'Closed now' }
}

function formatTime(min: number): string {
  const h = Math.floor(min / 60)
  const m = min % 60
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`
}
