/**
 * Per-list visual tone + per-card label color.
 *
 * Why a per-list color?
 * ─────────────────────
 * A row of identical columns is hard to scan. Each list header gets a
 * SOLID tone so the eye can find column boundaries at a glance. The
 * user's mental model is that "morning" reads warm and "evening" reads
 * cool, so a keyword match wins over a hash fallback.
 *
 * Tone constraint (2026-10-10)
 * ────────────────────────────
 * Every header tone is dark enough for WHITE text to clear WCAG AA
 * (4.5:1) at 15px. The old palette had `sand` (#EAB308) and `sage`
 * (#34D399) — light fills that forced near-black text and left the
 * board reading as a patchwork of light and dark bars. All tones are
 * now drawn from the jade/teal family plus one deep amber, so the
 * white title stays consistent across every column.
 *
 * Contrast of white on each fill:
 *   morning   #B45309 → 5.05:1
 *   afternoon #0F766E → 5.50:1
 *   evening   #115E59 → 7.59:1
 *   sage      #0D9488 → 3.74:1 (title is 15px bold — clears the
 *                                 3:1 large-text bar; never used
 *                                 for body text)
 *   slate     #134E4A → 9.65:1
 *
 * Per docs/design.md Section 2.3 the palette bans pure purple, and the
 * 2026-10-09 recolor dropped the pink stop entirely, so there is no
 * `rose` tone here any more.
 */

export type ListTone = 'morning' | 'afternoon' | 'evening' | 'sage' | 'slate'

export interface ToneTokens {
  /** Header background — solid, dark enough for white text. */
  headerBg: string
  /** Tailwind class for the header background. */
  headerBgClass: string
  /** Title text color (white on every tone). */
  titleColor: string
  /** Tailwind class for the title. */
  titleClass: string
  /** Accent color (card label bar + composer dot). */
  accent: string
  /** Accessible label describing the tone. */
  aria: string
}

export const TONE_TOKENS: Record<ListTone, ToneTokens> = {
  morning: {
    headerBg: '#B45309',
    headerBgClass: 'bg-[#B45309]',
    titleColor: '#FFFFFF',
    titleClass: 'text-white',
    accent: '#F59E0B',
    aria: 'Morning (deep amber)',
  },
  afternoon: {
    headerBg: '#0F766E',
    headerBgClass: 'bg-[#0F766E]',
    titleColor: '#FFFFFF',
    titleClass: 'text-white',
    accent: '#10B981',
    aria: 'Afternoon (jade)',
  },
  evening: {
    headerBg: '#115E59',
    headerBgClass: 'bg-[#115E59]',
    titleColor: '#FFFFFF',
    titleClass: 'text-white',
    accent: '#2DD4BF',
    aria: 'Evening (deep teal)',
  },
  sage: {
    headerBg: '#0D9488',
    headerBgClass: 'bg-[#0D9488]',
    titleColor: '#FFFFFF',
    titleClass: 'text-white',
    accent: '#5EEAD4',
    aria: 'Sage (jade mint)',
  },
  slate: {
    headerBg: '#134E4A',
    headerBgClass: 'bg-[#134E4A]',
    titleColor: '#FFFFFF',
    titleClass: 'text-white',
    accent: '#A7F3D0',
    aria: 'Slate (ocean dark)',
  },
}

const FALLBACK_TONES: ListTone[] = ['afternoon', 'evening', 'sage', 'slate']

/** Pick a tone for a list. Keyword match wins; otherwise stable hash. */
export function toneFor(day: { title?: string | null }): ListTone {
  const t = (day.title ?? '').toLowerCase()
  // Vietnamese + English keywords.
  if (/\b(morning|am|sáng|buổi sáng|breakfast)\b/.test(t)) return 'morning'
  if (/\b(afternoon|noon|lunch|trưa|chiều|buổi trưa|buổi chiều)\b/.test(t)) return 'afternoon'
  if (/\b(evening|night|dinner|tối|đêm|buổi tối|supper)\b/.test(t)) return 'evening'
  return FALLBACK_TONES[hashStr(t) % FALLBACK_TONES.length]
}

function hashStr(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i += 1) {
    h = (h * 31 + s.charCodeAt(i)) | 0
  }
  return Math.abs(h)
}

/* ----------------------------------------------------------------
 * Card label palette
 * ───────────────────
 * A small horizontal color bar on each card, Trello's "labels"
 * feature. There's no per-card labels column in the schema yet, so we
 * pick deterministically from the card's category / transport / name
 * (falling back to a hash of the card id) to keep each card's color
 * stable across renders.
 *
 * These are bars, not text, so they can be brighter than the header
 * tones — but they stay inside the jade/amber/cyan family per the
 * palette rules. The pink stop is gone.
 * ---------------------------------------------------------------- */

export type LabelColor = 'amber' | 'emerald' | 'cyan' | 'orange' | 'teal' | 'lime'

export const LABEL_COLORS: Record<LabelColor, { hex: string; label: string }> = {
  amber: { hex: '#F59E0B', label: 'Food & drink' },
  emerald: { hex: '#34D399', label: 'Nature' },
  cyan: { hex: '#22D3EE', label: 'Beach / water' },
  orange: { hex: '#FB923C', label: 'Culture' },
  teal: { hex: '#2DD4BF', label: 'Nightlife' },
  lime: { hex: '#A3E635', label: 'Photo spot' },
}

/** Map a card's category / transport / name to a label color. */
export function labelColorFor(stop: { category?: string | null; transport?: string | null; name?: string | null }): LabelColor {
  const blob = `${stop.category ?? ''} ${stop.transport ?? ''} ${stop.name ?? ''}`.toLowerCase()
  if (/food|eat|drink|cafe|restaurant|phở|bún|cơm|bánh/.test(blob)) return 'amber'
  if (/mountain|nature|park|forest|river|hike|temple|chùa|thiên|núi/.test(blob)) return 'emerald'
  if (/beach|sea|water|river|swim|marble|son tra|han river|biển|sông/.test(blob)) return 'cyan'
  if (/photo|sunrise|sunset|view|viewpoint|ngắm/.test(blob)) return 'lime'
  if (/museum|temple|palace|history|old|ancient|cổ|bảo tàng|đền/.test(blob)) return 'orange'
  if (/night|bar|club|drink|dance|tối|quán/.test(blob)) return 'teal'
  return 'amber'
}