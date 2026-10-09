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
 * 2026-10-09 v3 recolor: each metric picks a tone (tourist / buddy /
 * info2 / hot) and renders a colored top border + colored value. The tone
 * is one of the 4 brand colors — so on a single page with 3+ MetricCards
 * you can see all 4 colors at a glance.
 */
type Tone = 'tourist' | 'buddy' | 'info2' | 'hot' | 'primary'

const TONE_CLASSES: Record<Tone, { border: string; text: string; bg: string }> = {
  tourist: { border: 'border-tourist', text: 'text-tourist', bg: 'bg-tourist' },
  buddy: { border: 'border-buddy', text: 'text-buddy', bg: 'bg-buddy' },
  info2: { border: 'border-info2', text: 'text-info2', bg: 'bg-info2' },
  hot: { border: 'border-hot', text: 'text-hot', bg: 'bg-hot' },
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
    <article className={`border-2 ${t.border} rounded-sm p-6 surface-transparent`}>
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
