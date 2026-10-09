/**
 * Per-list visual tone.
 *
 * Why a per-list color?
 * ─────────────────────
 * Six flat-border columns in a row are visually monotonous. The
 * Trello convention is to give each list a small left accent that
 * matches its semantic role (morning / afternoon / evening / other).
 * This gives the eye an anchor when scanning the board.
 *
 * The mapping is keyword-driven first (matches user mental model:
 * "morning" = warm, "evening" = cool), then falls back to a stable
 * hash of the title for "other" lists so the same list always gets
 * the same color across renders.
 *
 * Per docs/design.md Section 2.3 we ban pure-purple / pure-indigo
 * from the palette; tones here are warm neutrals and dusty blues.
 */

export type ListTone = 'morning' | 'afternoon' | 'evening' | 'sand' | 'sage' | 'slate' | 'rose'

interface ToneTokens {
  /** CSS hex for the 2px left border accent. */
  border: string
  /** Tailwind classes for the left border. */
  borderClass: string
  /** Header background — very pale tint of the accent. */
  headerBgClass: string
  /** Title text color, also used for the count chip border. */
  titleClass: string
  /** Accessible label for screen readers describing the tone. */
  aria: string
}

export const TONE_TOKENS: Record<ListTone, ToneTokens> = {
  morning: {
    border: '#F59E0B',
    borderClass: 'border-l-[#F59E0B]',
    headerBgClass: 'bg-[#FFFBEB]',
    titleClass: 'text-[#92400E]',
    aria: 'Morning (amber)',
  },
  afternoon: {
    border: '#FF6B35',
    borderClass: 'border-l-[#FF6B35]',
    headerBgClass: 'bg-[#FFF4ED]',
    titleClass: 'text-[#9A3412]',
    aria: 'Afternoon (orange)',
  },
  evening: {
    border: '#7C3D52',
    borderClass: 'border-l-[#7C3D52]',
    headerBgClass: 'bg-[#F7EEF1]',
    titleClass: 'text-[#7C3D52]',
    aria: 'Evening (rose)',
  },
  sand: {
    border: '#B58A3F',
    borderClass: 'border-l-[#B58A3F]',
    headerBgClass: 'bg-[#FAF6EC]',
    titleClass: 'text-[#854D0E]',
    aria: 'Sand',
  },
  sage: {
    border: '#5C7A52',
    borderClass: 'border-l-[#5C7A52]',
    headerBgClass: 'bg-[#F0F4EC]',
    titleClass: 'text-[#3F5737]',
    aria: 'Sage',
  },
  slate: {
    border: '#475569',
    borderClass: 'border-l-[#475569]',
    headerBgClass: 'bg-[#F1F5F9]',
    titleClass: 'text-[#334155]',
    aria: 'Slate',
  },
  rose: {
    border: '#9F1239',
    borderClass: 'border-l-[#9F1239]',
    headerBgClass: 'bg-[#FFF1F2]',
    titleClass: 'text-[#9F1239]',
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
