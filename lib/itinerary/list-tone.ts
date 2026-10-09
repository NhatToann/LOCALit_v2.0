/**
 * Per-list visual tone.
 *
 * Why a per-list color?
 * ─────────────────────
 * A row of 6 identical columns is hard to scan. The Trello Pro / dark
 * theme convention is to give each list header a SOLID saturated
 * color so it pops against the dark board. The user mental model:
 * "morning" reads as warm, "evening" reads as cool, so the keyword
 * match wins over a hash fallback for those.
 *
 * Card label bar
 * ──────────────
 * Trello also lets users pin colored "labels" to a card. We expose
 * a small palette (LABEL_COLORS) for SortableCard to pick from
 * based on the card's category or transport, so the board has
 * visual variety beyond just list headers. The same hex values
 * are used for both the list header and the card label, so the
 * two systems feel like one palette.
 *
 * Per docs/design.md Section 2.3 we ban pure-purple / pure-indigo
 * from the palette; tones here are warm neutrals and dusty blues.
 */

export type ListTone = 'morning' | 'afternoon' | 'evening' | 'sand' | 'sage' | 'slate' | 'rose'

export interface ToneTokens {
  /** Header background — SOLID saturated color for dark theme. */
  headerBg: string
  /** Tailwind class for the header background. */
  headerBgClass: string
  /** Title text color (white works on all these solids). */
  titleColor: string
  /** Tailwind class for the title. */
  titleClass: string
  /** Accent color (used by the card label bar + small dot in list composer). */
  accent: string
  /** Accessible label for screen readers describing the tone. */
  aria: string
}

export const TONE_TOKENS: Record<ListTone, ToneTokens> = {
  morning: {
    headerBg: '#F59E0B',
    headerBgClass: 'bg-[#F59E0B]',
    titleColor: '#FFFFFF',
    titleClass: 'text-white',
    accent: '#F59E0B',
    aria: 'Morning (amber)',
  },
  afternoon: {
    headerBg: '#F97316',
    headerBgClass: 'bg-[#F97316]',
    titleColor: '#FFFFFF',
    titleClass: 'text-white',
    accent: '#F97316',
    aria: 'Afternoon (orange)',
  },
  evening: {
    headerBg: '#EC4899',
    headerBgClass: 'bg-[#EC4899]',
    titleColor: '#FFFFFF',
    titleClass: 'text-white',
    accent: '#EC4899',
    aria: 'Evening (pink)',
  },
  sand: {
    headerBg: '#EAB308',
    headerBgClass: 'bg-[#EAB308]',
    titleColor: '#0F172A',
    titleClass: 'text-[#0F172A]',
    accent: '#EAB308',
    aria: 'Sand',
  },
  sage: {
    headerBg: '#10B981',
    headerBgClass: 'bg-[#10B981]',
    titleColor: '#FFFFFF',
    titleClass: 'text-white',
    accent: '#10B981',
    aria: 'Sage',
  },
  slate: {
    headerBg: '#3B82F6',
    headerBgClass: 'bg-[#3B82F6]',
    titleColor: '#FFFFFF',
    titleClass: 'text-white',
    accent: '#3B82F6',
    aria: 'Slate',
  },
  rose: {
    headerBg: '#EF4444',
    headerBgClass: 'bg-[#EF4444]',
    titleColor: '#FFFFFF',
    titleClass: 'text-white',
    accent: '#EF4444',
    aria: 'Rose',
  },
}

const FALLBACK_TONES: ListTone[] = ['sand', 'sage', 'slate', 'rose']

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
 * Saturated colors that pop against a dark board backdrop.
 * Trello pins a small horizontal color bar to a card to give
 * at-a-glance category cues. We don't have a per-card labels
 * column in the schema yet, so we pick deterministically from
 * the card's category or transport string (fallback: hash of
 * the card id) so each card gets a stable color across renders.
 * ---------------------------------------------------------------- */

export type LabelColor = 'amber' | 'emerald' | 'sky' | 'rose' | 'orange' | 'teal'

export const LABEL_COLORS: Record<LabelColor, { hex: string; label: string }> = {
  amber: { hex: '#F59E0B', label: 'Food & drink' },
  emerald: { hex: '#10B981', label: 'Nature' },
  sky: { hex: '#3B82F6', label: 'Beach / water' },
  rose: { hex: '#EC4899', label: 'Photo spot' },
  orange: { hex: '#F97316', label: 'Culture' },
  teal: { hex: '#14B8A6', label: 'Nightlife' },
}

/** Map a card's category / transport / name to a label color. */
export function labelColorFor(stop: { category?: string | null; transport?: string | null; name?: string | null }): LabelColor {
  const blob = `${stop.category ?? ''} ${stop.transport ?? ''} ${stop.name ?? ''}`.toLowerCase()
  if (/food|eat|drink|cafe|restaurant|phở|bún|cơm|bánh/.test(blob)) return 'amber'
  if (/mountain|nature|park|forest|river|hike|temple|chùa|thiên|núi/.test(blob)) return 'emerald'
  if (/beach|sea|water|river|swim|marble|son tra|han river|biển|sông/.test(blob)) return 'sky'
  if (/photo|sunrise|sunset|view|viewpoint|ngắm/.test(blob)) return 'rose'
  if (/museum|temple|palace|history|old|ancient|cổ|bảo tàng|đền/.test(blob)) return 'orange'
  if (/night|bar|club|drink|dance|tối|quán/.test(blob)) return 'teal'
  return 'amber'
}
