/**
 * MetricCard — declarative number card with monospace metric + bilingual label
 *
 * Per `frontend-design` skill: "Typography carries the personality of the
 * page. You don't need a different typeface for display or headline text
 * and body content — use one family or two, and if two, make them clearly
 * distinct."
 *
 * LOCALit uses Plus Jakarta Sans (display + body) + JetBrains Mono (data).
 * Numbers and money get the mono family: they look measured, not marketing.
 *
 * Tabular numerals prevent layout shift when the value re-renders.
 *
 * 2026-10-10 v5 recolor: tone is one of 2 brand colors (tourist / buddy)
 * plus a neutral primary tone. No blue, no coral. Each card uses a
 * SOLID colored top border, never an alpha tint.
 */
type Tone = 'tourist' | 'buddy' | 'primary'

const TONE_CLASSES: Record<Tone, { border: string; text: string; bg: string }> = {
  tourist: { border: 'border-tourist', text: 'text-tourist', bg: 'bg-tourist' },
  buddy: { border: 'border-buddy', text: 'text-buddy-ink', bg: 'bg-buddy' },
  primary: { border: 'border-primary', text: 'text-primary', bg: 'bg-primary' },
}

export function MetricCard({
  value,
  label,
  labelVi,
  tone = 'primary',
}: {
  value: string
  /** English descriptive label */
  label: string
  /** Vietnamese parallel — small, italic, muted */
  labelVi: string
  tone?: Tone
}) {
  const t = TONE_CLASSES[tone]
  return (
    <article className={`border-2 ${t.border} bg-paper rounded-sm p-6`}>
      <p
        className="text-5xl font-medium text-ink mb-3"
        style={{
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
          fontVariantNumeric: 'tabular-nums',
          letterSpacing: '-0.02em',
        }}
      >
        {value}
      </p>
      <p className="text-sm text-ink leading-snug">{label}</p>
      <p
        className="text-xs italic text-muted leading-snug"
        style={{ letterSpacing: '0.01em' }}
        aria-hidden="true"
      >
        {labelVi}
      </p>
    </article>
  )
}
