/**
 * Per-list visual tone.
 *
 * Why a per-list color?
 * ─────────────────────
 * A row of 6 identical columns on a Trello board is hard to scan.
 * The Trello convention is to give each list header a tinted
 * background that matches its semantic role (morning / afternoon
 * / evening / other). The user mental model: "morning" reads as
 * warm, "evening" reads as cool, so the keyword match wins over
 * a hash fallback for those.
 *
 * Card label bar
 * ──────────────
 * Trello also lets users pin colored "labels" to a card. We expose
 * a small palette (LABEL_COLORS) for SortableCard to pick from
 * based on the card's category or transport, so the board has
 * visual variety beyond just list headers. The same hex values
 * are used for both the list header tint and the card label,
 * so the two systems feel like one palette.
 *
 * Per docs/design.md Section 2.3 we ban pure-purple / pure-indigo
 * from the palette; tones here are warm neutrals and dusty blues.
 */

export type ListTone = 'morning' | 'afternoon' | 'evening' | 'sand' | 'sage' | 'slate' | 'rose'

export interface ToneTokens {
  /** Header background tint (the dominant color in Trello columns). */
  headerBg: string
  /** Tailwind class for the header background. */
  headerBgClass: string
  /** Title text color, also used for the small dot. */
  titleColor: string
  /** Tailwind class for the title. */
  titleClass: string
  /** Accent color (used by the small dot + the column hover border). */
  accent: string
  /** Accessible label for screen readers describing the tone. */
  aria: string
}

export const TONE_TOKENS: Record<ListTone, ToneTokens> = {
  morning: {
    headerBg: '#FEF3C7',
    headerBgClass: 'bg-[#FEF3C7]',
    titleColor: '#92400E',
    titleClass: 'text-[#92400E]',
    accent: '#F59E0B',
    aria: 'Morning (amber)',
  },
  afternoon: {
    headerBg: '#FFEDD5',
    headerBgClass: 'bg-[#FFEDD5]',
    titleColor: '#9A3412',
    titleClass: 'text-[#9A3412]',
    accent: '#F97316',
    aria: 'Afternoon (orange)',
  },
  evening: {
    headerBg: '#FCE7F3',
    headerBgClass: 'bg-[#FCE7F3]',
    titleColor: '#9F1239',
    titleClass: 'text-[#9F1239]',
    accent: '#EC4899',
    aria: 'Evening (pink)',
  },
  sand: {
    headerBg: '#FEF3C7',
    headerBgClass: 'bg-[#FAF6EC]',
    titleColor: '#854D0E',
    titleClass: 'text-[#854D0E]',
    accent: '#B58A3F',
    aria: 'Sand',
  },
  sage: {
    headerBg: '#DCFCE7',
    headerBgClass: 'bg-[#DCFCE7]',
    titleColor: '#166534',
    titleClass: 'text-[#166534]',
    accent: '#10B981',
    aria: 'Sage',
  },
  slate: {
    headerBg: '#DBEAFE',
    headerBgClass: 'bg-[#DBEAFE]',
    titleColor: '#1E3A8A',
    titleClass: 'text-[#1E3A8A]',
    accent: '#3B82F6',
    aria: 'Slate',
  },
  rose: {
    headerBg: '#FECACA',
    headerBgClass: 'bg-[#FECACA]',
    titleColor: '#7F1D1D',
    titleClass: 'text-[#7F1D1D]',
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
